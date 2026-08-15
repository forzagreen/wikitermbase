import configparser
import logging
import os
import re
from collections import Counter
from typing import Literal

import sentry_sdk
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
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

APP_DESCRIPTION = """
Read-only, public, unauthenticated API powering [WikiTermBase](https://wikitermbase.toolforge.org)
— a multilingual (Arabic / English / French) terminology lookup service designed to
standardise vocabulary on [Arabic Wikipedia](https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي).

Backed by a MariaDB full-text search (`MATCH ... AGAINST` in natural-language mode) over a
dataset curated in the [arabterm](https://github.com/forzagreen/arabterm) repository.

Source code: [github.com/forzagreen/wikitermbase](https://github.com/forzagreen/wikitermbase).
""".strip()

TAGS_METADATA = [
    {
        "name": "Search",
        "description": "Full-text lookup over the term database.",
    },
    {
        "name": "Metadata",
        "description": "Information about dictionaries and dataset statistics.",
    },
    {
        "name": "Health",
        "description": "Liveness and readiness probes for monitoring.",
    },
]

app = FastAPI(
    title="WikiTermBase API",
    summary="Multilingual (Arabic / English / French) terminology lookup for Arabic Wikipedia.",
    description=APP_DESCRIPTION,
    version="1.0.0",
    contact={
        "name": "forzagreen",
        "url": "https://github.com/forzagreen/wikitermbase",
    },
    license_info={
        "name": "MIT",
        "url": "https://github.com/forzagreen/wikitermbase/blob/main/LICENSE",
    },
    openapi_tags=TAGS_METADATA,
)

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
            d.dict_type as dictionary_dict_type,
            d.tier as dictionary_tier,
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


# Separator characters this dataset uses to pack multiple synonymous
# translations into a single field: ';', '/', and the Arabic '،' / '؛'.
# Deliberately excludes the plain ',' -- entries also use it for headword
# inversion ("profile, hydraulic") and gender/POS annotations
# ("vitesse commerciale, f"), so splitting on it would fabricate bogus terms.
SEPARATOR_RE = re.compile(r"[;/،؛]")


def split_translations(value: str) -> list[str]:
    """Split a field that may pack multiple synonymous translations into its
    individual parts (see SEPARATOR_RE), trimming incidental whitespace."""
    return [part.strip() for part in SEPARATOR_RE.split(value) if part.strip()]


def _strip_query_quotes(query: str) -> str:
    # The frontend and gadget both send q=`"${term}"` (literal quotes) as a
    # leftover phrase-search hint; MariaDB's NATURAL LANGUAGE MODE ignores
    # them, but our own exact-match comparison needs the bare term.
    query = query.strip()
    if len(query) >= 2 and query[0] == query[-1] == '"':
        query = query[1:-1].strip()
    return query


def query_matches_term(term: dict, query: str) -> bool:
    """True when `query` exactly matches one of the term's translations.

    Compares against every part of a multi-translation field (see
    split_translations), not just the field as a whole, so a query like
    "telescope" matches a term whose english is "reflecting telescope"
    only if "telescope" is itself one of the listed synonyms.
    """
    query = _strip_query_quotes(query)
    if not query:
        return False

    arabic = term.get("arabic")
    if arabic:
        query_ar = normalise_arabic(query)
        if query_ar and any(
            normalise_arabic(part) == query_ar for part in split_translations(arabic)
        ):
            return True

    for field, normaliser in (
        ("english", normalise_english),
        ("french", normalise_french),
    ):
        value = term.get(field)
        if not value:
            continue
        query_norm = normaliser(query).casefold()
        if query_norm and any(
            normaliser(part).casefold() == query_norm
            for part in split_translations(value)
        ):
            return True

    return False


# Display/ranking order for dictionary types within a result group.
# Anything missing or not in this map (e.g. not-yet-classified dictionaries)
# sorts after all known types.
DICT_TYPE_ORDER = {"terminology": 0, "language": 1, "thesaurus": 2}
UNRANKED_TIER = 999  # Sorts after every real tier (1..5) when tier is missing.


def occurrence_sort_key(term: dict):
    type_priority = DICT_TYPE_ORDER.get(
        term.get("dictionary_dict_type"), len(DICT_TYPE_ORDER)
    )
    tier = term.get("dictionary_tier")
    tier_priority = tier if tier is not None else UNRANKED_TIER
    return (type_priority, tier_priority, term.get("dictionary_wikidata_id") is None)


def aggregate_terms(results: list[dict], query: str = "") -> list[dict]:
    """Aggregate terms by arabic term (after cleaning it)."""
    # Flag rows that are an exact match for the query (on any one of their
    # possibly multiple translations), so those groups can be bubbled to the
    # top regardless of how many dictionaries carry a merely-related phrase.
    # Keyed by object identity rather than mutating `term`, so this internal
    # flag never leaks into the API response.
    exact_match_by_id = {id(term): query_matches_term(term, query) for term in results}

    # Normalise arabic terms. A single field may pack several synonymous
    # spellings/terms (see split_translations); each part is a grouping
    # candidate, and any two rows sharing a part end up in the same group.
    results_with_arabic = [term for term in results if "arabic" in term]

    variants_by_id = {}
    for term in results_with_arabic:
        variants = [
            v
            for v in (
                normalise_arabic(part) for part in split_translations(term["arabic"])
            )
            if v
        ]
        variants_by_id[id(term)] = variants or [normalise_arabic(term["arabic"])]

    # Union-find over normalised arabic variants: any two terms sharing a
    # variant end up in the same connected component/group.
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[root_a] = root_b

    for term in results_with_arabic:
        variants = variants_by_id[id(term)]
        for variant in variants[1:]:
            union(variants[0], variant)

    groups_dict = dict()
    for term in results_with_arabic:
        key = find(variants_by_id[id(term)][0])
        groups_dict.setdefault(key, []).append(term)

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

        # Order occurences by dictionary type (terminology, then language, then
        # thesaurus; anything else/unclassified last), then by tier ascending
        # (tier 1 = most reliable first, unranked last). Ties keep relevance
        # order, but bubble entries without a QID to the end.
        group["occurences"].sort(key=occurrence_sort_key)

    # Add total relevance
    groups.sort(key=lambda x: len(x["occurences"]), reverse=True)
    for group in groups:
        group["total_relevance"] = sum(
            variant["relevance"] for variant in group["occurences"]
        )

    # Sort by: exact match first (a group where some occurrence's translation
    # exactly equals the query), then number of unique dictionaries, then
    # total relevance.
    groups.sort(
        key=lambda x: (
            any(exact_match_by_id[id(term)] for term in x["occurences"]),
            len(x["dictionary_ids"]),
            x["total_relevance"],
        ),
        reverse=True,
    )
    return groups


class TermResult(BaseModel):
    """A term row joined with its dictionary metadata.

    Extra fields from the underlying ``term`` and ``dictionary`` tables flow through
    transparently — the schema documents the stable subset only.
    """

    model_config = ConfigDict(extra="allow")

    id: int
    dictionary_id: int
    arabic: str | None = None
    english: str | None = None
    french: str | None = None
    description: str | None = None
    relevance: float
    dictionary_name_arabic: str
    dictionary_wikidata_id: str | None = None
    dictionary_dict_type: str | None = None
    dictionary_tier: int | None = None


class SearchResponse(BaseModel):
    q: str
    number_results: int
    results: list[TermResult]


class TermGroup(BaseModel):
    """A cluster of `TermResult`s sharing the same normalised Arabic term."""

    model_config = ConfigDict(extra="allow")

    arabic_normalised: str | None = None
    english_normalised: str
    french_normalised: str | None = None
    dictionary_ids: list[int]
    total_relevance: float
    occurences: list[TermResult]


class AggregatedSearchResponse(BaseModel):
    q: str
    number_groups: int
    groups: list[TermGroup]


class Dictionary(BaseModel):
    """A row from the ``dictionary`` table. Extra columns flow through."""

    model_config = ConfigDict(extra="allow")

    id: int
    name_arabic: str
    wikidata_id: str | None = None
    dict_type: str | None = None
    tier: int | None = None


class DictionariesResponse(BaseModel):
    number: int
    dictionaries: list[Dictionary]


class StatsResponse(BaseModel):
    number_terms: int
    number_dictionaries: int


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unreachable"]


@app.get(
    "/api/v1/search",
    tags=["Search"],
    summary="Raw full-text search",
    response_model=SearchResponse,
    response_model_exclude_none=True,
    response_description="Matching terms ordered by full-text relevance (highest first).",
)
def search(
    q: str = Query(
        ...,
        description="Free-text query. Matched against Arabic, English, French and description fields using MariaDB `MATCH ... AGAINST` in natural-language mode.",
        examples=["telescope", "اشتقاق"],
    ),
    include_descriptions: bool = Query(
        True,
        description="Include each term's `description` field in the response. Set to `false` to slim the payload.",
    ),
):
    """Search across all dictionaries and return individual matching terms.

    Each result includes the term's columns plus its parent dictionary's
    `name_arabic` and `wikidata_id`, ordered by full-text relevance.
    For grouped/de-duplicated results, prefer `/api/v1/search/aggregated`.
    """
    results = search_terms_mariadb(q, include_descriptions)
    return {"q": q, "number_results": len(results), "results": results}


@app.get(
    "/api/v1/search/aggregated",
    tags=["Search"],
    summary="Search results aggregated by normalised Arabic term",
    response_model=AggregatedSearchResponse,
    response_model_exclude_none=True,
    response_description="Term groups, exact matches for the query first, then ordered by number of distinct dictionaries (desc), then by total relevance (desc).",
)
def search_aggregated(
    q: str = Query(
        ...,
        description="Free-text query. Matched against Arabic, English, French and description fields using MariaDB `MATCH ... AGAINST` in natural-language mode.",
        examples=["telescope", "اشتقاق"],
    ),
    include_descriptions: bool = Query(
        True,
        description="Include each term's `description` field within every occurrence. Set to `false` to slim the payload.",
    ),
):
    """Search and group results by normalised Arabic term.

    Raw matches are clustered by `normalise_arabic(arabic)` (diacritics, tatweel
    and the `ال` prefix stripped, hamza forms unified). A field packing several
    synonymous translations (separated by `;`, `/`, or the Arabic `،` / `؛`) is
    split into its parts first, so e.g. an Arabic field of `"تلسكوب، مقراب"`
    joins the groups for both `تلسكوب` and `مقراب` instead of forming an
    isolated group of its own. Each group elects the most common original
    Arabic spelling, the most common normalised English translation, and —
    when present — the most common normalised French translation. Within a
    group, occurrences are ordered by dictionary type (`terminology`, then
    `language`, then `thesaurus`; unclassified last), then by `tier` ascending
    (1 = most reliable), then bubbling entries without a Wikidata ID to the
    end.

    Groups are sorted with exact matches first — a group where some
    occurrence's Arabic/English/French translation (or one part of a
    multi-translation field) equals the query exactly — then by the number of
    distinct dictionaries that contain the term (desc), then by the sum of
    relevance scores within the group (desc). This is the endpoint used by
    the on-wiki gadget.
    """
    sentry_sdk.set_tag("search.q", q[:200])  # Sentry caps tag values at 200 chars

    results = search_terms_mariadb(q, include_descriptions)

    # Disable arabterm URIs as it's disabled in their website
    if DISABLE_ARABTERM_URIS:
        for result in results:
            if "uri" in result and "arabterm.org" in result["uri"]:
                del result["uri"]

    groups = aggregate_terms(results, q)
    number_groups = len(groups)

    sentry_sdk.set_tag("search.number_groups", str(number_groups))
    sentry_sdk.set_measurement("search.number_groups", number_groups)
    logger.info("search_aggregated q=%r number_groups=%d", q, number_groups)

    return {"q": q, "number_groups": number_groups, "groups": groups}


@app.get(
    "/api/v1/dicts",
    tags=["Metadata"],
    summary="List dictionaries",
    response_model=DictionariesResponse,
    response_description="Every dictionary indexed by the service.",
)
def list_dicts():
    """Return every dictionary in the database with its full metadata.

    Use the `id` of a dictionary to map `dictionary_id` values returned by the
    search endpoints back to a human-readable source name.
    """
    result = execute_with_retry(text("SELECT * FROM dictionary"))
    dictionaries = [dict(row) for row in result.mappings().all()]
    return {"number": len(dictionaries), "dictionaries": dictionaries}


@app.get(
    "/api/v1/stats",
    tags=["Metadata"],
    summary="Dataset statistics",
    response_model=StatsResponse,
    response_description="Total counts of terms and dictionaries.",
)
def get_stats():
    """Return the total number of terms and dictionaries currently indexed."""
    terms_count = execute_with_retry(text("SELECT COUNT(*) as count FROM term"))
    dicts_count = execute_with_retry(text("SELECT COUNT(*) as count FROM dictionary"))
    return {
        "number_terms": terms_count.scalar(),
        "number_dictionaries": dicts_count.scalar(),
    }


@app.get(
    "/healthz",
    tags=["Health"],
    summary="Health check",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse, "description": "Database unreachable"}},
    response_description="Application and database status.",
)
def healthz():
    """Liveness + readiness probe.

    Returns `200` with `status: ok` when the app is up and the MariaDB replica
    answers a trivial `SELECT 1`. Returns `503` with `status: degraded` if the
    database round-trip fails. Safe to poll from uptime monitors and Toolforge
    / Kubernetes readiness probes.
    """
    try:
        execute_with_retry(text("SELECT 1")).scalar()
        return {"status": "ok", "database": "ok"}
    except Exception:
        # Probes must always return a structured response — never a 500.
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unreachable"},
        )


@app.get("/", include_in_schema=False)
@app.get("/dictionaries", include_in_schema=False)
@app.get("/ui/search/raw", include_in_schema=False)
def index():
    return FileResponse(INDEX_HTML)


app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
