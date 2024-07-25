from flask import Flask, request

from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine, Column, ForeignKey, select, Index
from sqlalchemy.types import Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship, backref, sessionmaker, declarative_base
import sqlalchemy.sql.functions as func

from csv import DictReader
from pathlib import Path

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


# Create a MariaDB connection engine
mariadb_engine = create_engine(
    "mysql+pymysql://root:MyTestPassWordOK@localhost:3306/arabterm"
)

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
