import configparser
import itertools
import logging
import os
import re
from collections import Counter
from functools import lru_cache
from typing import Literal

import sentry_sdk
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
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
    # `t.id` is a deterministic tiebreak: InnoDB relevance is close to a raw
    # term frequency, so most rows of a broad query tie on it (80% for "نظام").
    # Without it, two runs could order groups differently and the paginated
    # windows of /api/v1/search/aggregated would overlap or skip.
    search_query = text("""
        SELECT
            t.*,
            d.name_arabic as dictionary_name_arabic,
            d.name_tech as dictionary_name_tech,
            d.wikidata_id as dictionary_wikidata_id,
            d.dict_type as dictionary_dict_type,
            d.tier as dictionary_tier,
            MATCH(t.arabic, t.english, t.french, t.description)
            AGAINST(:query IN NATURAL LANGUAGE MODE) as relevance
        FROM term t
        JOIN dictionary d ON t.dictionary_id = d.id
        WHERE MATCH(t.arabic, t.english, t.french, t.description)
        AGAINST(:query IN NATURAL LANGUAGE MODE)
        ORDER BY relevance DESC, t.id
    """)

    result = execute_with_retry(search_query, {"query": fulltext_query(query_text)})
    results = result.mappings().all()

    # Remove excluded fields
    excluded_fields = {"created_at", "updated_at"}
    if (not include_descriptions) or DISABLE_DESCRIPTIONS:
        excluded_fields.add("description")
    return [
        {k: v for k, v in row.items() if k not in excluded_fields and v is not None}
        for row in results
    ]


# Each dictionary has a browsable page on the arabterm GitHub Pages site,
# keyed by its `name_tech` slug (e.g. `ksaa_music`).
ARABTERM_PAGES_URL = "https://forzagreen.github.io/arabterm/"


def arabterm_url(name_tech: str | None) -> str | None:
    """Public arabterm page for a dictionary, or None when it has no slug."""
    if not name_tech:
        return None
    return f"{ARABTERM_PAGES_URL}{name_tech}/"


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
    # Replace non-Arabic and non-Latin characters with space
    text = re.sub(r"[^\u0600-\u06FFA-Za-z\s]", " ", text)
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
    # The frontend and gadget both send q=`"${term}"` (literal quotes). They
    # reach MariaDB as-is, where InnoDB treats them as a phrase search even in
    # NATURAL LANGUAGE MODE (`"data system"` matches 6 rows, unquoted it ORs
    # the tokens and matches thousands). Our own exact-match comparison needs
    # the bare term.
    query = query.strip()
    if len(query) >= 2 and query[0] == query[-1] == '"':
        query = query[1:-1].strip()
    return query


def _is_quoted(query: str) -> bool:
    query = query.strip()
    return len(query) >= 2 and query[0] == query[-1] == '"'


# --- Query expansion ---------------------------------------------------------
#
# The fulltext index has no stemming and knows nothing about British/American
# spelling, so "telescopes", "colour centre" or "e-mails" return nothing while
# "telescope", "color center" and "e-mail" are in the database. expand_query()
# derives a few spelling variants of the query and the database is asked for
# all of them at once. Variants are added, never substituted: a wrong guess
# ("axes" -> "axe", "ax" and "axis") costs one lookup of a phrase that matches
# nothing, and the query as typed still ranks first (see query_match_rank).
# Only Latin-script tokens are touched; Arabic passes through unchanged (that
# branch is planned in docs/ideas/search-robustness.md).

MAX_QUERY_VARIANTS = 8
# Product of the per-token candidates that is sorted and capped; bounds the
# work on long queries.
MAX_VARIANT_COMBINATIONS = 64

# Longest `q` the search endpoints accept. A term is a few words; a pasted
# article is not a query, and InnoDB rejects phrases over 128 words with a
# 500 ("Too many words in a FTS phrase or proximity search"). The gadget and
# the UI cap the typed text at 200 so the quotes they add around it still fit.
MAX_QUERY_LENGTH = 256

# Plurals no suffix rule gets right: Greek and Latin neuters, -ix/-ex words
# (a rule would turn "devices" into "devix") and -f/-fe words (likewise
# "valves"). The rules in singular_candidates cover -s/-es/-ies, -ae, -i,
# -ses/-sis and -aux.
IRREGULAR_PLURALS = {
    "apices": "apex",
    "appendices": "appendix",
    "automata": "automaton",
    "bacteria": "bacterium",
    "calves": "calf",
    "children": "child",
    "codices": "codex",
    "corpora": "corpus",
    "cortices": "cortex",
    "criteria": "criterion",
    "curricula": "curriculum",
    "data": "datum",
    "feet": "foot",
    "genera": "genus",
    "halves": "half",
    "helices": "helix",
    "hooves": "hoof",
    "indices": "index",
    "knives": "knife",
    "leaves": "leaf",
    "lemmata": "lemma",
    "loaves": "loaf",
    "matrices": "matrix",
    "maxima": "maximum",
    "media": "medium",
    "men": "man",
    "mice": "mouse",
    "minima": "minimum",
    "momenta": "momentum",
    "optima": "optimum",
    "ova": "ovum",
    "phenomena": "phenomenon",
    "quanta": "quantum",
    "radices": "radix",
    "schemata": "schema",
    "sheaves": "sheaf",
    "shelves": "shelf",
    "spectra": "spectrum",
    "stomata": "stoma",
    "strata": "stratum",
    "taxa": "taxon",
    "teeth": "tooth",
    "vertices": "vertex",
    "vortices": "vortex",
    "women": "woman",
}

# Plain (British, American) substrings that differ; applied in both
# directions anywhere in the token, so "haematology" and "sulphates" work too.
SPELLING_PAIRS = [
    ("aluminium", "aluminum"),
    ("aeroplane", "airplane"),
    ("aesth", "esth"),
    ("aetiolog", "etiolog"),
    ("amoeb", "ameb"),
    ("anaem", "anem"),
    ("archaeo", "archeo"),
    ("artefact", "artifact"),
    ("caesium", "cesium"),
    ("coeliac", "celiac"),
    ("diarrhoe", "diarrhe"),
    ("draught", "draft"),
    ("faecal", "fecal"),
    ("faeces", "feces"),
    ("foetal", "fetal"),
    ("foetus", "fetus"),
    ("grey", "gray"),
    ("gynaec", "gynec"),
    ("haem", "hem"),
    ("homoeo", "homeo"),
    ("judgement", "judgment"),
    ("kerb", "curb"),
    ("leukaem", "leukem"),
    ("manoeuv", "maneuv"),
    ("mollusc", "mollusk"),
    ("mould", "mold"),
    ("oedem", "edem"),
    ("oesoph", "esoph"),
    ("oestr", "estr"),
    ("orthopaed", "orthoped"),
    ("paediatr", "pediatr"),
    ("plough", "plow"),
    ("sceptic", "skeptic"),
    ("speciality", "specialty"),
    ("sulph", "sulf"),
]

# Regex rules for the productive British/American families, each written in
# both directions. Stems are listed where a suffix alone would be ambiguous
# ("motor" must not become "motour", "science" must not become "sciense").
_OUR_STEMS = r"(arm|behavi|col|endeav|fav|flav|harb|hon|hum|lab|neighb|od|rig|rum|sav|tum|vap|vig)"
_RE_STEMS = r"(calib|cent|fib|goit|lit|lust|met|mit|nit|och|somb|spect|theat|tit)"
_OGUE_STEMS = r"(anal|catal|dial|epil|homol|monol|prol)"
_ENCE_STEMS = r"(def|lic|off|pret)"
SPELLING_RULES = [
    # oxidise, organisation, analyser; analyse, catalyse
    (r"is(e|ed|es|ing|er|ers|ation|ations|able)$", r"iz\1"),
    (r"iz(e|ed|es|ing|er|ers|ation|ations|able)$", r"is\1"),
    (r"ys(e|ed|es|ing|er|ers)$", r"yz\1"),
    (r"yz(e|ed|es|ing|er|ers)$", r"ys\1"),
    # colour, vapour, behaviour (and colourimeter, vaporisation)
    (rf"^{_OUR_STEMS}our", r"\1or"),
    (rf"^{_OUR_STEMS}or", r"\1our"),
    # centre, fibre, kilometre, litre, calibre, titre
    (rf"{_RE_STEMS}re(s|d)?$", r"\1er\2"),
    (rf"{_RE_STEMS}er(s|d)?$", r"\1re\2"),
    # modelling, labelled, signalling, traveller
    (r"([aeiou])ll(ed|ing|er|ers|ation)$", r"\1l\2"),
    (r"([aeiou])l(ed|ing|er|ers|ation)$", r"\1ll\2"),
    # catalogue, analogue, dialogue (not analogy, analogous)
    (rf"^{_OGUE_STEMS}ogue", r"\1og"),
    (rf"^{_OGUE_STEMS}og(?=s?$|ed$)", r"\1ogue"),
    # programme, kilogramme
    (r"gramme(s)?$", r"gram\1"),
    (r"gram(s)?$", r"gramme\1"),
    # defence, licence, offence, pretence
    (rf"^{_ENCE_STEMS}ence", r"\1ense"),
    (rf"^{_ENCE_STEMS}ense", r"\1ence"),
    # tyre, disc (anchored: "entire", "discount")
    (r"^tyre(s)?$", r"tire\1"),
    (r"^tire(s)?$", r"tyre\1"),
    (r"^disc(s)?$", r"disk\1"),
    (r"^disk(s)?$", r"disc\1"),
    # British ae/oe digraphs, for words missing from SPELLING_PAIRS. The
    # reverse direction is not generalisable ("e" -> "ae" anywhere).
    (r"ae", "e"),
    (r"oe", "e"),
]


def _pair_rules(uk: str, us: str) -> list[tuple[re.Pattern, str]]:
    # When the American form is a suffix of the British one ("estr" in
    # "oestr"), the US -> UK rule must not fire on a token that is already
    # British, or "oestrogen" would yield "ooestrogen".
    us_pattern = re.escape(us)
    if uk.endswith(us):
        us_pattern = rf"(?<!{re.escape(uk[: -len(us)])}){us_pattern}"
    return [(re.compile(re.escape(uk)), us), (re.compile(us_pattern), uk)]


SPELLING_RULES = [(re.compile(p), r) for p, r in SPELLING_RULES] + [
    rule for uk, us in SPELLING_PAIRS for rule in _pair_rules(uk, us)
]

# A word of Latin letters (accents included), optionally hyphenated or
# apostrophised; never digits ("3d", "h2o") or Arabic script.
LATIN_WORD_RE = re.compile(r"[^\W\d_]+(?:['\-][^\W\d_]+)*")
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


def singular_candidates(token: str) -> list[str]:
    """Possible singulars of a lowercase English/French token, best guess
    first; empty when it does not look like a plural.

    Where the suffix is ambiguous every reading is returned ("axes" -> "axe",
    "ax", "axis"; "lenses" -> "lense", "lens") and the database decides which
    exists.
    """
    if token in IRREGULAR_PLURALS:
        return [IRREGULAR_PLURALS[token]]
    if len(token) < 4 or token.endswith(("ss", "us", "is", "ics")):
        return []
    if token.endswith("ies"):  # categories -> category
        return [token[:-3] + "y"]
    if token.endswith("ae"):  # formulae -> formula
        return [token[:-1]]
    if token.endswith("i"):  # radii -> radius
        return [token[:-1] + "us"]
    if token.endswith("aux"):  # réseaux -> réseau, chevaux -> cheval
        return [token[:-1], token[:-3] + "al"]
    if token.endswith("x"):  # jeux -> jeu
        return [token[:-1]]
    if token.endswith("s"):  # telescopes -> telescope
        candidates = [token[:-1]]
        # -es is a suffix of its own only after a sibilant or -o: boxes,
        # gases, lenses, matches, volcanoes (but phases -> phase only).
        if token.endswith(("ses", "xes", "zes", "ches", "shes", "oes")):
            candidates.append(token[:-2])
        # Greek -sis plurals: analyses, hypotheses, diagnoses, axes.
        if token.endswith(("ses", "xes")) and token[-4] in "aeiouy":
            candidates.append(token[:-2] + "is")
        return candidates
    return []


def spelling_candidates(token: str) -> list[str]:
    """The other-side-of-the-Atlantic spellings of a lowercase token, if
    any rule in SPELLING_RULES applies to it."""
    candidates = []
    for pattern, replacement in SPELLING_RULES:
        if pattern.search(token):
            candidate = pattern.sub(replacement, token)
            if candidate != token and candidate not in candidates:
                candidates.append(candidate)
    return candidates


def token_candidates(token: str) -> list[str]:
    """`token` (lowercased) first, then its hyphen-free, singular and
    alternative-spelling forms, deduplicated."""
    token = token.casefold()
    if not LATIN_WORD_RE.fullmatch(token) or ARABIC_RE.search(token):
        return [token]
    bases = [token]
    if "-" in token:
        bases.append(token.replace("-", ""))  # e-mail -> email
    singulars = [s for base in bases for s in singular_candidates(base)]
    candidates = bases + singulars
    candidates += [s for form in bases + singulars for s in spelling_candidates(form)]
    return list(dict.fromkeys(candidates))


@lru_cache(maxsize=1024)
def expand_query(query: str) -> tuple[str, ...]:
    """The bare query as typed, followed by up to MAX_QUERY_VARIANTS - 1
    variants of it (singulars, British/American spellings, hyphens removed),
    fewest changed tokens first.

    Cached: the aggregation compares every result row against these.
    """
    bare = _strip_query_quotes(query)
    tokens = bare.split()
    if not tokens or '"' in bare:
        # Empty, or a query with its own phrase operators: leave it alone.
        return (bare,)

    per_token = [token_candidates(token) for token in tokens]
    combinations = itertools.islice(
        itertools.product(*per_token), MAX_VARIANT_COMBINATIONS
    )
    ranked = sorted(
        combinations,
        key=lambda combo: sum(
            word != candidates[0] for word, candidates in zip(combo, per_token)
        ),
    )
    variants = [bare]
    for combo in ranked:
        variant = " ".join(combo)
        if variant != bare.casefold() and variant not in variants:
            variants.append(variant)
    return tuple(variants[:MAX_QUERY_VARIANTS])


def fulltext_query(query: str) -> str:
    """What is sent to MATCH ... AGAINST for `query`: the query itself when it
    has no variants, otherwise the query and its variants.

    A quoted query is a phrase search (see _strip_query_quotes), and several
    quoted phrases in natural-language mode match the union of the phrases, so
    each variant is quoted too and the phrase semantics survive. An unquoted
    query already ORs its tokens; the variants' tokens just join the bag.
    """
    variants = expand_query(query)
    if len(variants) == 1:
        return query
    if _is_quoted(query):
        return " ".join(f'"{variant}"' for variant in variants)
    return " ".join(
        dict.fromkeys(word for variant in variants for word in variant.split())
    )


# How closely a term's translation matches the query (see query_match_rank).
MATCH_AS_TYPED = 2
MATCH_VARIANT = 1
NO_MATCH = 0


def query_match_rank(term: dict, query: str) -> int:
    """MATCH_AS_TYPED when one of the term's translations is exactly the
    query, MATCH_VARIANT when it is exactly one of the query's variants (see
    expand_query: "boundary conditions" -> "boundary condition"), else
    NO_MATCH.

    Compares against every part of a multi-translation field (see
    split_translations), not just the field as a whole, so a query like
    "telescope" matches a term whose english is "reflecting telescope"
    only if "telescope" is itself one of the listed synonyms.
    """
    variants = expand_query(query)
    query_typed = variants[0]
    if not query_typed:
        return NO_MATCH

    arabic = term.get("arabic")
    if arabic:
        query_ar = normalise_arabic(query_typed)
        if query_ar and any(
            normalise_arabic(part) == query_ar for part in split_translations(arabic)
        ):
            return MATCH_AS_TYPED

    return _translation_match_rank(term, variants)


def query_matches_term(term: dict, query: str) -> bool:
    """True when the term translates the query or one of its variants."""
    return query_match_rank(term, query) > NO_MATCH


def _translation_match_rank(term: dict, variants: tuple[str, ...]) -> int:
    """English/French half of query_match_rank; `variants` come from
    expand_query, the query as typed first."""
    rank = NO_MATCH
    for field, normaliser in (
        ("english", normalise_english),
        ("french", normalise_french),
    ):
        value = term.get(field)
        if not value:
            continue
        parts = {normaliser(part).casefold() for part in split_translations(value)}
        for i, variant in enumerate(variants):
            variant_norm = normaliser(variant).casefold()
            if variant_norm and variant_norm in parts:
                rank = max(rank, MATCH_AS_TYPED if i == 0 else MATCH_VARIANT)
                break
    return rank


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


# Election of the "suggested translation" (the UI's «الترجمة المقترحة» badge).
# Every dictionary that gives the query itself as a translation of a group's
# Arabic term votes for that group, with a weight of 6 - tier (tier 1 = 5 votes,
# tier 5 or unranked = 1). The leading group is suggested only when its score
# reaches SUGGESTION_MIN_SCORE (one tier-1 dictionary, or several lesser ones
# agreeing; a lone web glossary is not enough) and is at least
# SUGGESTION_MARGIN times the runner-up's. A contested query -- two senses
# ("bank": مصرف / ضفة) or two rival terms ("gene": مورثة / جين) -- gets no
# suggestion rather than an arbitrary one.
SUGGESTION_MIN_SCORE = 5
SUGGESTION_MARGIN = 1.5


def dictionary_vote(term: dict) -> int:
    tier = term.get("dictionary_tier")
    if tier is None:
        return 1
    return max(6 - tier, 1)


def suggestion_score(variant: str, occurences: list[dict], query: str) -> int:
    """Votes for the group of normalised Arabic `variant` as the translation
    of `query`.

    Only occurrences translating the query itself count, so neither a related
    phrase ("Netscape Navigator" for "Netscape") nor another sense filed under
    the same Arabic term adds weight. For an Arabic query that means the group
    of that very term: a packed row like "تلسكوب، مقراب" matches "مقراب", but
    must not make تلسكوب its suggested translation. Each dictionary votes
    once, however many entries it has.
    """
    variants = expand_query(query)
    if not variants[0]:
        return 0
    is_query_variant = normalise_arabic(variants[0]) == variant
    votes = {}
    for term in occurences:
        if is_query_variant or _translation_match_rank(term, variants) > NO_MATCH:
            votes[term["dictionary_id"]] = dictionary_vote(term)
    return sum(votes.values())


def elect_suggested_group(scores: list[int]) -> int | None:
    """Index of the winning score, or None when no group qualifies."""
    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    if not ranked or scores[ranked[0]] < SUGGESTION_MIN_SCORE:
        return None
    runner_up = scores[ranked[1]] if len(ranked) > 1 else 0
    if scores[ranked[0]] < SUGGESTION_MARGIN * runner_up:
        return None
    return ranked[0]


def aggregate_terms(results: list[dict], query: str = "") -> list[dict]:
    """Aggregate terms by arabic term (after cleaning it)."""
    # Ignore rows without an English value (NULL, empty or whitespace-only):
    # every group elects an English headline, and such rows are data errors
    # tracked upstream (arabterm's validation_baseline.json) until fixed. They
    # must not break the search in the meantime.
    results = [term for term in results if (term.get("english") or "").strip()]

    # Rank rows that are an exact match for the query (on any one of their
    # possibly multiple translations) -- as typed above one of its variants
    # (see query_match_rank) -- so those groups can be bubbled to the top
    # regardless of how many dictionaries carry a merely-related phrase.
    # Keyed by object identity rather than mutating `term`, so this internal
    # rank never leaks into the API response.
    match_rank_by_id = {id(term): query_match_rank(term, query) for term in results}

    # Normalise arabic terms. A single field may pack several synonymous
    # spellings/terms (see split_translations); each part independently
    # looks for (or starts) its own group by exact normalised match. A
    # packed row therefore contributes a separate virtual occurrence to
    # every group its parts belong to -- e.g. "مِقراب؛ راصدة" adds one
    # occurrence to the (pre-existing) "مقراب" group and another to a
    # standalone "راصدة" group, without merging those two groups together.
    results_with_arabic = [term for term in results if "arabic" in term]

    # For each term: list of (normalised_variant, raw_part) pairs, one per
    # distinct part of its arabic field (deduplicated, order preserved).
    memberships_by_id = {}
    for term in results_with_arabic:
        seen_variants = set()
        pairs = []
        for raw_part in split_translations(term["arabic"]):
            variant = normalise_arabic(raw_part)
            if variant and variant not in seen_variants:
                seen_variants.add(variant)
                pairs.append((variant, raw_part))
        memberships_by_id[id(term)] = pairs or [
            (normalise_arabic(term["arabic"]), term["arabic"])
        ]

    # variant -> list of (term, raw_part) contributed by that variant.
    groups_dict = dict()
    for term in results_with_arabic:
        for variant, raw_part in memberships_by_id[id(term)]:
            groups_dict.setdefault(variant, []).append((term, raw_part))

    groups = []
    suggestion_scores = []
    for variant, entries in groups_dict.items():
        raw_parts = [raw_part for _term, raw_part in entries]
        groups.append(
            {
                # Elect the raw (unnormalised) spelling used most often to
                # reach this group, so a packed field like "تلسكوب، مِقْراب"
                # doesn't become the displayed headline for either group.
                "arabic_normalised": Counter(raw_parts).most_common(1)[0][0],
                "occurences": [term for term, _raw_part in entries],
            }
        )
        suggestion_scores.append(
            suggestion_score(variant, groups[-1]["occurences"], query)
        )

    # Flag the suggested translation, if any (see SUGGESTION_MIN_SCORE). Only
    # groups with an Arabic term are candidates: the ones added below have
    # nothing to suggest.
    suggested_index = elect_suggested_group(suggestion_scores)
    if suggested_index is not None:
        groups[suggested_index]["suggested"] = True

    # Add terms without arabic as separate groups with one occurence
    results_without_arabic = [term for term in results if "arabic" not in term]
    groups.extend([{"occurences": [term]} for term in results_without_arabic])

    for group in groups:
        # Add unique dictionaries ids
        group["dictionary_ids"] = sorted(
            list(set(term["dictionary_id"] for term in group["occurences"]))
        )

        # Elect an english term (normalised), the most used one. Every entry
        # has one: rows without english were dropped above.
        english_terms = [normalise_english(x["english"]) for x in group["occurences"]]
        group["english_normalised"] = Counter(english_terms).most_common(1)[0][0]

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

    # Sort by: the suggested translation, then exact match (a group where some
    # occurrence's translation exactly equals the query as typed, then one of
    # its variants), then number of unique dictionaries, then total relevance.
    groups.sort(
        key=lambda x: (
            x.get("suggested", False),
            max(match_rank_by_id[id(term)] for term in x["occurences"]),
            len(x["dictionary_ids"]),
            x["total_relevance"],
        ),
        reverse=True,
    )
    return groups


def paginate_groups(
    groups: list[dict], offset: int = 0, limit: int | None = None
) -> list[dict]:
    """Window of `groups` starting at `offset`; everything after it when
    `limit` is None.

    Applied after aggregation on purpose: relevance ties are too massive for a
    SQL-side LIMIT, which would cut occurrences out of the top groups and
    shrink their dictionary count.
    """
    if limit is None:
        return groups[offset:]
    return groups[offset : offset + limit]


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
    dictionary_name_tech: str | None = None
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
    suggested: bool = Field(
        False,
        description="True for at most one group per query: the Arabic term that the dictionaries agree on as the translation of `q`. Computed over all groups, so it does not depend on `limit`/`offset`.",
    )
    occurences: list[TermResult]


class AggregatedSearchResponse(BaseModel):
    """`number_groups` is the total for the query, not the size of `groups`:
    more pages remain while `offset + len(groups) < number_groups`."""

    q: str
    number_groups: int
    offset: int = 0
    limit: int | None = None
    groups: list[TermGroup]


class Dictionary(BaseModel):
    """A row from the ``dictionary`` table. Extra columns flow through."""

    model_config = ConfigDict(extra="allow")

    id: int
    name_arabic: str
    name_tech: str | None = None
    wikidata_id: str | None = None
    dict_type: str | None = None
    tier: int | None = None
    arabterm_url: str | None = None


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
        max_length=MAX_QUERY_LENGTH,
        description="Free-text query, at most 256 characters. Matched against Arabic, English, French and description fields using MariaDB `MATCH ... AGAINST` in natural-language mode. Wrap it in double quotes for a phrase search. Latin-script queries are also searched as their singular (`telescopes` → `telescope`), hyphen-free (`e-mail` → `email`) and British/American (`colour centre` → `color center`) variants; a quoted query stays a phrase search, its variants are searched as phrases too.",
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
    response_description="Term groups, exact matches for the query first, then ordered by number of distinct dictionaries (desc), then by total relevance (desc). `number_groups` is the total for the query; `groups` is the requested window of it.",
)
def search_aggregated(
    q: str = Query(
        ...,
        max_length=MAX_QUERY_LENGTH,
        description="Free-text query, at most 256 characters. Matched against Arabic, English, French and description fields using MariaDB `MATCH ... AGAINST` in natural-language mode. Wrap it in double quotes for a phrase search. Latin-script queries are also searched as their singular (`telescopes` → `telescope`), hyphen-free (`e-mail` → `email`) and British/American (`colour centre` → `color center`) variants; a quoted query stays a phrase search, its variants are searched as phrases too.",
        examples=["telescope", "اشتقاق"],
    ),
    include_descriptions: bool = Query(
        True,
        description="Include each term's `description` field within every occurrence. Set to `false` to slim the payload.",
    ),
    limit: int | None = Query(
        None,
        ge=1,
        le=100,
        description="Maximum number of groups to return. Omit to get every group (the default, kept for backward compatibility). Broad queries produce thousands of groups and multi-megabyte responses, so interactive clients should pass e.g. `limit=30` and page with `offset`.",
        examples=[30],
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Number of groups to skip, in the order described below. The next page is `offset + len(groups)`; there is one while that is lower than `number_groups`.",
    ),
):
    """Search and group results by normalised Arabic term.

    Raw matches are clustered by `normalise_arabic(arabic)` (diacritics, tatweel
    and the `ال` prefix stripped, hamza forms unified). A field packing several
    synonymous translations (separated by `;`, `/`, or the Arabic `،` / `؛`) is
    split into its parts first, and each part independently joins (or starts)
    its own group by exact normalised match — e.g. an Arabic field of
    `"مِقراب؛ راصدة"` contributes a virtual occurrence to the (pre-existing)
    `مقراب` group and another to a standalone `راصدة` group, without merging
    those two groups together. Each group elects the most common original
    Arabic spelling among the parts that reached it, the most common
    normalised English translation, and — when present — the most common
    normalised French translation. Within a group, occurrences are ordered by
    dictionary type (`terminology`, then `language`, then `thesaurus`;
    unclassified last), then by `tier` ascending (1 = most reliable), then
    bubbling entries without a Wikidata ID to the end.

    Groups are sorted with the suggested translation first (see below), then
    exact matches — a group where some occurrence's Arabic/English/French
    translation (or one part of a multi-translation field) equals the query
    exactly, as typed before one of its variants (see `q`) — then by the
    number of distinct dictionaries that contain the term (desc), then by the
    sum of relevance scores within the group (desc). This is the endpoint
    used by the on-wiki gadget.

    **Suggested translation.** At most one group has `suggested: true`. Each
    dictionary giving the query itself (or one of its variants) as a
    translation of the group's Arabic term votes for it once, weighted by
    reliability (`6 - tier`: 5 votes for
    tier 1, 1 for tier 5 or unranked). The leading group is suggested when it
    gathers at least 5 votes and at least 1.5 times the runner-up's; a query
    with thin or contested evidence has no suggestion.

    Rows without an English value are ignored: they are data errors tracked in
    the arabterm repository. `/api/v1/search` still returns them.

    **Pagination.** `limit` and `offset` select a window of the ordered groups;
    `number_groups` is always the total. Grouping and ordering are computed
    over every matching row on each request — the server keeps no state
    between pages — and the order is deterministic, so consecutive windows
    neither overlap nor skip a group.
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
    # How often clients go past the first page, and how slow those requests are.
    sentry_sdk.set_tag("search.offset", str(offset))
    logger.info(
        "search_aggregated q=%r fulltext=%r number_groups=%d offset=%d limit=%s",
        q,
        fulltext_query(q),
        number_groups,
        offset,
        limit,
    )

    return {
        "q": q,
        "number_groups": number_groups,
        "offset": offset,
        "limit": limit,
        "groups": paginate_groups(groups, offset, limit),
    }


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
    dictionaries = [
        {**row, "arabterm_url": arabterm_url(row.get("name_tech"))}
        for row in result.mappings().all()
    ]
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
@app.get("/tools", include_in_schema=False)
@app.get("/ui/search/raw", include_in_schema=False)
def index():
    return FileResponse(INDEX_HTML)


app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
