import configparser
import os

from arabterm.mariadb_models import Dictionary as MariaDBDictionary
from arabterm.mariadb_models import Term as MariaDBTerm
from flask import Flask, render_template, request, send_from_directory
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import QueuePool

RESPONSE_HEADERS = {"Access-Control-Allow-Origin": "*"}
POOL_SIZE = 10
POOL_RECYCLE = 3600  # Recycle connections after 1 hour
MAX_OVERFLOW = 20
POOL_TIMEOUT = 30
RETRY_COUNT = 3

app = Flask(
    __name__,
    static_folder="frontend/dist",  # Where your React built files will be
    template_folder="frontend/dist",  # Where your index.html will be
)


@app.route("/")
def index():
    return render_template("index.html")


# Serve static files for React app
@app.route("/assets/<path:path>")
def serve_static(path):
    return send_from_directory("frontend/dist/assets", path)


def setup_db_engine():
    config = configparser.ConfigParser()
    hostname = "localhost"
    port = 3306
    database = "arabterm"
    HOME = os.environ.get("HOME")

    if HOME == "/data/project/wikitermbase":  # Toolforge
        print("We are on Toolforge")
        config.read(f"{HOME}/replica.my.cnf")
        hostname = "tools.db.svc.wikimedia.cloud"
        user = config["client"]["user"]
        password = config["client"]["password"]
        database = f"{user}__arabterm"
    else:  # localhost
        print("We are on localhost")
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


def search_terms_mariadb(query_text: str) -> list[dict]:
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
    excluded_fields = {"created_at", "updated_at", "german"}
    return [
        {k: v for k, v in row.items() if k not in excluded_fields and v is not None}
        for row in results
    ]


@app.route("/search")
def search():
    if "q" not in request.args:
        return {"error": "Missing 'q' parameter"}, 400

    q = request.args["q"]
    results = search_terms_mariadb(q)
    return (
        {"q": q, "number_results": len(results), "results": results},
        200,
        RESPONSE_HEADERS,
    )


@app.route("/dicts")
def list_dicts():
    result = execute_with_retry(text("SELECT * FROM dictionary"))
    dictionaries = [dict(row) for row in result.mappings().all()]
    return (
        {"number": len(dictionaries), "dictionaries": dictionaries},
        200,
        RESPONSE_HEADERS,
    )


@app.route("/stats")
def get_stats():
    terms_count = execute_with_retry(text("SELECT COUNT(*) as count FROM term"))
    dicts_count = execute_with_retry(text("SELECT COUNT(*) as count FROM dictionary"))
    return (
        {
            "number_terms": terms_count.scalar(),
            "number_dictionaries": dicts_count.scalar(),
        },
        200,
        RESPONSE_HEADERS,
    )
