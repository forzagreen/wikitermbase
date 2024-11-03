import configparser
import os

from flask import Flask, request
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

app = Flask(__name__)


def setup_db_engine():
    config = configparser.ConfigParser()
    hostname = "localhost"
    port = 3306
    database = "arabterm"
    HOME = os.environ.get("HOME")
    if HOME == "/data/project/wikitermbase":  # We are on Toolforge
        print("We are on Toolforge")
        config.read(f"{HOME}/replica.my.cnf")
        hostname = "tools.db.svc.wikimedia.cloud"
        user = config["client"]["user"]
        password = config["client"]["password"]
        database = f"{user}__arabterm"
    else:  # We are on localhost
        print("We are on localhost")
        config.read("./var/local.cnf")
        user = config["client"]["user"]
        password = config["client"]["password"]
    return create_engine(
        f"mysql+pymysql://{user}:{password}@{hostname}:{port}/{database}"
    )


mariadb_engine = setup_db_engine()
SessionMariaDB = sessionmaker(bind=mariadb_engine)


def search_terms_mariadb(query_text: str) -> list[dict]:
    """
    Search for terms in the MariaDB database.
    """
    results = []
    with SessionMariaDB() as mariadb_session:
        results = (
            mariadb_session.execute(
                text(
                    """
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
                """
                ),
                {"query": query_text},
            )
            .mappings()
            .all()
        )
    # Remove fields from the results
    excluded_fields = {"created_at", "updated_at", "german"}
    filtered_results = [
        {k: v for k, v in result.items() if k not in excluded_fields and v is not None}
        for result in results
    ]
    return filtered_results


@app.route("/search")
def search():
    if "q" not in request.args:
        return {"error": "Missing 'q' parameter"}, 400

    q = request.args["q"]
    results = search_terms_mariadb(q)
    response_data = {"q": q, "number_results": len(results), "results": results}
    return response_data, 200, {"Access-Control-Allow-Origin": "*"}
