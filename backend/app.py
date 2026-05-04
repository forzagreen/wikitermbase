import configparser
import logging
import os
import re
from collections import Counter

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import QueuePool

POOL_SIZE = 10
POOL_RECYCLE = 3600  # Recycle connections after 1 hour
MAX_OVERFLOW = 20
POOL_TIMEOUT = 30
RETRY_COUNT = 3

# Don't return Arabterm URIs in the results
DISABLE_ARABTERM_URIS = False
# Disable descriptions in all results
DISABLE_DESCRIPTIONS = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
INDEX_HTML = os.path.join(FRONTEND_DIST, "index.html")
ASSETS_DIR = os.path.join(FRONTEND_DIST, "assets")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


def setup_sentry():
    """Setup Sentry (only in Toolforge)."""
    if "TOOL_REPLICA_USER" not in os.environ:  # Toolforge only
        return

    def traces_sampler(sampling_context):
        # Capture only /api/v1/search/aggregated transactions so the shared
        # quota isn't burned on static assets and lower-value endpoints.
        asgi_scope = sampling_context.get("asgi_scope") or {}
        if asgi_scope.get("path") == "/api/v1/search/aggregated":
            return 1.0
        return 0.0

    sentry_sdk.init(
        dsn="https://8b5085bb300d843114fe9414af77ed76@o91475.ingest.us.sentry.io/4508865550286848",
        # Do not track PII (Personally Identifiable Information)
        send_default_pii=False,
        traces_sampler=traces_sampler,
    )


setup_sentry()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def tag_referer(request: Request, call_next):
    if request.url.path == "/api/v1/search/aggregated":
        # Tag the request's origin to split arwiki gadget vs Toolforge UI traffic.
        referer = request.headers.get("referer", "")
        if referer.startswith("https://ar.wikipedia.org/"):
            referer_source = "arwiki"
        elif referer.startswith("https://wikitermbase.toolforge.org/"):
            referer_source = "toolforge"
        elif referer:
            referer_source = "other"
        else:
            referer_source = "none"
        sentry_sdk.set_tag("referer.source", referer_source)
        sentry_sdk.set_tag("referer", referer[:200])
    return await call_next(request)


def setup_db_engine():
    hostname = "localhost"
    port = 3306
    database = "arabterm"

    if "TOOL_REPLICA_USER" in os.environ:
        # Toolforge — works for both the legacy python3.13 uWSGI webservice
        # (which used to read $HOME/replica.my.cnf) and the Build Service
        # backend (where $HOME is not the tool data dir, but TOOL_REPLICA_USER
        # / TOOL_REPLICA_PASSWORD are still injected as env vars).
        logger.info("We are on Toolforge")
        user = os.environ["TOOL_REPLICA_USER"]
        password = os.environ["TOOL_REPLICA_PASSWORD"]
        hostname = "tools.db.svc.wikimedia.cloud"
        database = f"{user}__arabterm"
    elif os.environ.get("HOME") == "/home/runner":  # Github Actions
        logger.info("We are on Github Actions")
        user, password = "test", "test"
    else:  # localhost
        logger.info("We are on localhost")
        config = configparser.ConfigParser()
        config.read("./var/local.cnf")
        user = config["client"]["user"]
        password = config["client"]["password"]

    engine = create_engine(
        f"mysql+pymysql://{user}:{password}@{hostname}:{port}/{database}",
        poolclass=QueuePool,
        pool_size=POOL_SIZE,
        max_overflow=MAX_OVERFLOW,
        pool_timeout=POOL_TIMEOUT,
        pool_recycle=POOL_RECYCLE,
        pool_pre_ping=True,  # Enable connection health checks
    )

    return engine


# Create the engine and session factory
mariadb_engine = setup_db_engine()


@event.listens_for(mariadb_engine, "connect")
def _force_read_only_session(dbapi_connection, connection_record):
    # MariaDB rejects DML/DDL on non-temp tables for the rest of the session.
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("SET SESSION TRANSACTION READ ONLY")
        dbapi_connection.commit()
    finally:
        cursor.close()


Session = scoped_session(sessionmaker(bind=mariadb_engine))


def execute_with_retry(query, params=None, max_retries=RETRY_COUNT):
    """Execute a read-only query with retry logic."""
    session = Session()
    try:
        for attempt in range(max_retries):
            try:
                result = session.execute(query, params)
                return result
            except OperationalError as e:
                if attempt == max_retries - 1:  # Last attempt
                    raise
                # If error is about connection, retry
                if "MySQL server has gone away" in str(e):
                    session.expire_all()  # Clear any stale state
                    continue
                raise
            except SQLAlchemyError:
                raise
    finally:
        session.close()


def search_terms_mariadb(
    query_text: str, include_descriptions: bool = True
) -> list[dict]:
    """Search for terms in the MariaDB database."""
    search_query = text("""
        SELECT
            t.*,
            d.name_arabic as dictionary_name_arabic,
            d.wikidata_id as dictionary_wikidata_id,
            MATCH(t.arabic, t.english, t.french, t.description)
            AGAINST(:query IN NATURAL LANGUAGE MODE) as relevance
        FROM term t
        JOIN dictionary d ON t.dictionary_id = d.id
        WHERE MATCH(t.arabic, t.english, t.french, t.description)
        AGAINST(:query IN NATURAL LANGUAGE MODE)
        ORDER BY relevance DESC
    """)

    result = execute_with_retry(search_query, {"query": query_text})
    results = result.mappings().all()

    # Remove excluded fields
    excluded_fields = {"created_at", "updated_at"}
    if (not include_descriptions) or DISABLE_DESCRIPTIONS:
        excluded_fields.add("description")
    return [
        {k: v for k, v in row.items() if k not in excluded_fields and v is not None}
        for row in results
    ]


def normalise_arabic(text: str) -> str:
    """Normalise Arabic text by removing diacritics and unwanted characters."""
    # Remove diacritics
    text = re.sub(r"[\u064B-\u0652]", "", text)
    # Remove tatweel
    text = re.sub(r"\u0640", "", text)
    # Remove AL prefix for all words
    text = re.sub(r"\bال", "", text)

    # Replace أ and إ and آ with ا
    text = re.sub(r"[\u0623\u0625\u0622]", "\u0627", text)

    # Remove anything inside parentheses
    text = re.sub(r"\(.*?\)", "", text)
    # Replace non-Arabic characters with space
    text = re.sub(r"[^\u0600-\u06FF\s]", " ", text)
    # Strip and remove extra spaces
    text = re.sub(r"\s+", " ", text.strip())
    return text


def normalise_english(text: str) -> str:
    """Normalise English text by removing unwanted characters."""
    # Strip and remove extra spaces
    text = re.sub(r"\s+", " ", text.strip())
    return text


def normalise_french(text: str) -> str:
    """Normalise French text by removing unwanted characters."""
    # Remove '(m.)', '(f.)', '[m.]', '[f.]'
    text = re.sub(r"\(m\.\)|\(f\.\)|\[m\.\]|\[f\.\]", "", text)
    # Strip and remove extra spaces
    text = re.sub(r"\s+", " ", text.strip())
    return text


def aggregate_terms(results: list[dict]) -> list[dict]:
    """Aggregate terms by arabic term (after cleaning it)."""
    # Normalise arabic terms
    results_with_arabic = [term for term in results if "arabic" in term]

    for term in results_with_arabic:
        term["arabic_normalised"] = normalise_arabic(term["arabic"])

    groups_dict = dict()
    for term in results_with_arabic:
        arabic_normalised = term["arabic_normalised"]
        if arabic_normalised not in groups_dict:
            groups_dict[arabic_normalised] = []
        groups_dict[arabic_normalised].append(term)

    groups = [
        {"arabic_normalised": key, "occurences": value}
        for key, value in groups_dict.items()
    ]

    # Add terms without arabic as separate groups with one occurence
    results_without_arabic = [term for term in results if "arabic" not in term]
    groups.extend([{"occurences": [term]} for term in results_without_arabic])

    for group in groups:
        # Add unique dictionaries ids
        group["dictionary_ids"] = sorted(
            list(set(term["dictionary_id"] for term in group["occurences"]))
        )

        # Elect an english term (normalised), the most used one.
        # Attention: we assume all entries have an english term.
        english_terms = [normalise_english(x["english"]) for x in group["occurences"]]
        group["english_normalised"] = Counter(english_terms).most_common(1)[0][0]

        # Change arabic_normalised by electing it from existing occurences.
        # The original arabic_normalised is useful for groupping, but sometimes produces incorrect terms.
        if "arabic_normalised" in group:
            arabic_terms = [x["arabic"] for x in group["occurences"]]
            group["arabic_normalised"] = Counter(arabic_terms).most_common(1)[0][0]

        # Elect a french term (normalised) among entries with french.
        french_terms = [
            normalise_french(x["french"])
            for x in group["occurences"]
            if x.get("french")
        ]
        if french_terms:
            group["french_normalised"] = Counter(french_terms).most_common(1)[0][0]

        # In occurences, keep the order, but bubble the ones without QID to the end
        group["occurences"].sort(key=lambda x: x.get("dictionary_wikidata_id") is None)

    # Add total relevance
    groups.sort(key=lambda x: len(x["occurences"]), reverse=True)
    for group in groups:
        group["total_relevance"] = sum(
            variant["relevance"] for variant in group["occurences"]
        )

    # Sort by: number of unique dictionaries, then total relevance:
    groups.sort(
        key=lambda x: (len(x["dictionary_ids"]), x["total_relevance"]), reverse=True
    )
    return groups


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/api/v1/search")
def search(q: str, include_descriptions: bool = True):
    results = search_terms_mariadb(q, include_descriptions)
    return {"q": q, "number_results": len(results), "results": results}


@app.get("/api/v1/search/aggregated")
def search_aggregated(q: str, include_descriptions: bool = True):
    sentry_sdk.set_tag("search.q", q[:200])  # Sentry caps tag values at 200 chars

    results = search_terms_mariadb(q, include_descriptions)

    # Disable arabterm URIs as it's disabled in their website
    if DISABLE_ARABTERM_URIS:
        for result in results:
            if "uri" in result and "arabterm.org" in result["uri"]:
                del result["uri"]

    groups = aggregate_terms(results)
    number_groups = len(groups)

    sentry_sdk.set_tag("search.number_groups", str(number_groups))
    sentry_sdk.set_measurement("search.number_groups", number_groups)
    logger.info("search_aggregated q=%r number_groups=%d", q, number_groups)

    return {"q": q, "number_groups": number_groups, "groups": groups}


@app.get("/api/v1/dicts")
def list_dicts():
    result = execute_with_retry(text("SELECT * FROM dictionary"))
    dictionaries = [dict(row) for row in result.mappings().all()]
    return {"number": len(dictionaries), "dictionaries": dictionaries}


@app.get("/api/v1/stats")
def get_stats():
    terms_count = execute_with_retry(text("SELECT COUNT(*) as count FROM term"))
    dicts_count = execute_with_retry(text("SELECT COUNT(*) as count FROM dictionary"))
    return {
        "number_terms": terms_count.scalar(),
        "number_dictionaries": dicts_count.scalar(),
    }


@app.get("/")
@app.get("/dictionaries")
@app.get("/ui/search/raw")
def index():
    return FileResponse(INDEX_HTML)


app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
