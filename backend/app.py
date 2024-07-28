import configparser
import os

from flask import Flask, request
from sqlalchemy import Column, ForeignKey, create_engine, func, text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.types import Boolean, DateTime, Integer, String, Text

Base = declarative_base()


class Category(Base):
    __tablename__ = "category"
    id = Column(Integer, primary_key=True)
    type = Column(Text)
    english = Column(Text)
    french = Column(Text)
    arabic = Column(Text)
    german = Column(Text)
    name = Column(Text)
    nbr_entries = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    entries = relationship("Entry", back_populates="category")


class Entry(Base):
    __tablename__ = "entry"
    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=False)
    english = Column(String(255), index=True)
    french = Column(String(255), index=True)
    arabic = Column(String(255), index=True)
    german = Column(String(255), index=True)
    vt = Column(Boolean)
    uatv = Column(Boolean)
    uri = Column(Text)
    has_image = Column(Boolean)
    image_uri_remote = Column(Text)
    image_uri_extract = Column(Text)
    description = Column(Text, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("Category", back_populates="entries")


def setup_db_engine():
    config = configparser.ConfigParser()
    hostname = "localhost"
    port = 3306
    database = "arabterm"
    if os.environ.get("USER") == "tools.wikitermbase":  # We are on Toolforge
        config.read("~/replica.my.cnf")
        hostname = "tools.db.svc.wikimedia.cloud"
        user = config["client"]["user"]
        password = config["client"]["password"]
        database = f"{user}__arabterm"
    else:  # We are on localhost
        config.read("./var/local.cnf")
        user = config["client"]["user"]
        password = config["client"]["password"]
    return create_engine(
        f"mysql+pymysql://{user}:{password}@{hostname}:{port}/{database}"
    )


# Create a MariaDB connection engine
mariadb_engine = setup_db_engine()

# Create a session
SessionMariaDB = sessionmaker(bind=mariadb_engine)


def search_term(term: str) -> list[dict]:
    with SessionMariaDB() as mariadb_session:
        # Build the relevance expression
        relevance_expr = text(f"""
            (
                MATCH(arabic) AGAINST(:search IN NATURAL LANGUAGE MODE) +
                MATCH(english) AGAINST(:search IN NATURAL LANGUAGE MODE) +
                MATCH(french) AGAINST(:search IN NATURAL LANGUAGE MODE) +
                MATCH(german) AGAINST(:search IN NATURAL LANGUAGE MODE) +
                MATCH(description) AGAINST(:search IN NATURAL LANGUAGE MODE)
            ) AS relevance
        """)

        # Custom SQLAlchemy query
        query = (
            mariadb_session.query(
                Entry.id,
                Entry.arabic,
                Entry.english,
                Entry.french,
                Entry.german,
                Entry.description,
                relevance_expr,
            )
            .from_statement(
                text(
                    f"""
                    SELECT
                        id, arabic, english, french, german, description,
                        (
                            MATCH(arabic) AGAINST(:search IN NATURAL LANGUAGE MODE) +
                            MATCH(english) AGAINST(:search IN NATURAL LANGUAGE MODE) +
                            MATCH(french) AGAINST(:search IN NATURAL LANGUAGE MODE) +
                            MATCH(german) AGAINST(:search IN NATURAL LANGUAGE MODE) +
                            MATCH(description) AGAINST(:search IN NATURAL LANGUAGE MODE)
                        ) AS relevance
                    FROM entry
                    HAVING relevance > 0
                    ORDER BY relevance DESC
                """
                )
            )
            .params(search=term)
        )
        results_raw = query.all()

        # 'relevance' is the last element in the tuple. It's not part of the Entry model
        results = [{**r._asdict(), "relevance": r[-1]} for r in results_raw]
        results = [{k: v for k, v in r.items() if v is not None} for r in results]

        return results


app = Flask(__name__)


@app.route("/search")
def search():
    if "q" not in request.args:
        return {"error": "Missing 'q' parameter"}, 400

    q = request.args["q"]
    results = search_term(q)
    response = {"q": q, "number_results": len(results), "results": results}
    return response
