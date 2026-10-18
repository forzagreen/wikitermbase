"""Morphological analysis of a result group's Arabic term (the site's optional
«تحليل صرفي» section, see MorphologySection.jsx).

Two local data sources, no network:

* farahidi (AlKhalil Morpho Sys 2 in pure Python) gives every reading of each
  word: root, lemma, pattern (وزن), part of speech with its features and the
  segmented clitics and affixes. Its lexicon (~150 MB once loaded) is shared
  by all the workers thanks to ``warm()`` + gunicorn ``--preload``.
* ``data/arabic_verbs.json.gz`` lists the verbs of every root, from the
  arabic-morphology tables (build_verbs_index.py); the UI pairs them with the
  senses published on Wikidata and conjugates them with mazini on demand.

Readings are ranked for a *term*: a dictionary headword is a bare nominal, so
a reading with clitics (وَ, بِ, ال, attached pronouns) or a verbal reading comes
after the others, and farahidi's corpus score orders the rest. Most readings
tie at score 0, so the UI shows the first one and lets the reader pick another.
"""

import gc
import gzip
import json
import os
import re
from functools import cache, lru_cache

import farahidi

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VERBS_INDEX_PATH = os.path.join(BASE_DIR, "data", "arabic_verbs.json.gz")

# Words a term can have (a dictionary headword, not a sentence).
MAX_WORDS = 8
# A word: Arabic letters (hamza seats included), with the diacritics, tatweel
# and superscript alef that may sit between them. Entries are often vowelled,
# and farahidi uses the vowels to narrow the readings.
ARABIC_LETTER = "\u0621-\u063a\u0641-\u064a\u0671-\u06d3"
ARABIC_MARK = "\u0640\u064b-\u0652\u0670"
ARABIC_WORD_RE = re.compile(f"[{ARABIC_LETTER}][{ARABIC_LETTER}{ARABIC_MARK}]*")
HAMZA_RE = re.compile("[أإآؤئ]")

ANALYZER = farahidi.Analyzer()


def canonical_root(root: str) -> str:
    """Root spelling shared by farahidi and Wikidata: every hamza seat is ء."""
    return HAMZA_RE.sub("ء", root)


@cache
def verbs_index() -> dict[str, list[dict]]:
    """Root (canonical) -> its verbs, each a dict with the index's FIELDS."""
    with gzip.open(VERBS_INDEX_PATH, "rt", encoding="utf-8") as f:
        data = json.load(f)
    fields = data["fields"]
    return {
        root: [dict(zip(fields, row)) for row in rows]
        for root, rows in data["roots"].items()
    }


def verbs_of_root(root: str) -> list[dict]:
    return verbs_index().get(canonical_root(root), [])


def reading_sort_key(analysis):
    """Readings a term is likely to be first: bare before clitic-bearing,
    nominal before verbal, common noun before proper noun (farahidi gives
    proper-noun readings of ذاكرة or إشعاع a small positive score), then
    farahidi's score. Ties (most readings score 0, and farahidi's own order
    among them differs between platforms) go to the reading that is its own
    lemma (a headword is a dictionary form), then to the plain noun (اسم جامد)
    over the derived types, then to fewer affixes, then to the lemma."""
    clitics = len(analysis.proclitics) + len(analysis.enclitics)
    affixes = len(analysis.prefixes) + len(analysis.suffixes)
    return (
        clitics,
        analysis.pos == "فعل",
        analysis.type == "اسم علم",
        -analysis.score,
        analysis.lemma != analysis.diacritized,
        analysis.type != "اسم جامد",
        affixes,
        analysis.lemma,
    )


def _affixes(affixes) -> list[dict]:
    return [{"form": a.form, "description": a.description} for a in affixes]


def serialize_reading(analysis) -> dict:
    features = [
        f
        for f in (
            analysis.pos,
            analysis.type,
            analysis.gender,
            analysis.number,
            analysis.tense,
            analysis.voice,
            analysis.person,
            analysis.transitivity,
            analysis.augmentation,
        )
        if f
    ]
    return {
        "diacritized": analysis.diacritized,
        "lemma": analysis.lemma,
        "root": analysis.root,
        "pattern": analysis.lemma_pattern or analysis.pattern,
        "stem_pattern": analysis.pattern,
        "pos": analysis.pos,
        "type": analysis.type,
        "features": features,
        "proclitics": _affixes(analysis.proclitics),
        "prefixes": _affixes(analysis.prefixes),
        "suffixes": _affixes(analysis.suffixes),
        "enclitics": _affixes(analysis.enclitics),
        "score": analysis.score,
    }


def _reading_identity(reading: dict) -> tuple:
    # farahidi lists one analysis per lexicon entry; a lemma whose entry is
    # repeated (e.g. two إعراب tables) would show twice without this.
    affixes = tuple(
        a["form"]
        for key in ("proclitics", "prefixes", "suffixes", "enclitics")
        for a in reading[key]
    )
    return (
        reading["lemma"],
        reading["pattern"],
        reading["type"],
        reading["root"],
        affixes,
    )


DIACRITICS_RE = re.compile(f"[{ARABIC_MARK}]")


def _analyses(word: str):
    """farahidi's analyses of ``word``; a vowelled word that matches nothing
    (a vowel the lexicon writes differently, a partial vowelling) is retried
    bare, so a dictionary's vowelling never costs the reading."""
    word = word.replace("\u0640", "")
    analyses = ANALYZER.analyze(word)
    bare = DIACRITICS_RE.sub("", word)
    if not analyses and bare != word:
        analyses = ANALYZER.analyze(bare)
    return analyses


@lru_cache(maxsize=8192)
def analyze_word(word: str) -> dict:
    analyses = sorted(_analyses(word), key=reading_sort_key)
    readings, seen = [], set()
    for analysis in analyses:
        reading = serialize_reading(analysis)
        identity = _reading_identity(reading)
        if identity in seen:
            continue
        seen.add(identity)
        readings.append(reading)
    roots = list(dict.fromkeys(r["root"] for r in readings if r["root"]))
    return {
        "word": word,
        "analyzed": bool(readings),
        "readings": readings,
        "roots": roots,
    }


def term_words(term: str) -> list[str]:
    return ARABIC_WORD_RE.findall(term)[:MAX_WORDS]


def analyze_term(term: str) -> dict:
    """The words of ``term`` with their readings, and the verbs of every root
    any reading proposes (so the UI can switch reading without a request)."""
    words = [analyze_word(w) for w in term_words(term)]
    roots = list(dict.fromkeys(root for w in words for root in w["roots"]))
    return {
        "term": term,
        "words": words,
        "verbs": {root: verbs_of_root(root) for root in roots},
    }


def warm():
    """Load the lexicon and the verbs index now, so that a gunicorn master
    started with --preload shares them with every worker it forks (and the
    first request of each worker is not the slow one). gc.freeze() keeps the
    collector from writing to those shared pages later."""
    for letter in "ابتثجحخدذرزسشصضطظعغفقكلمنهوي":
        ANALYZER.analyze(letter + "كتب")
    verbs_index()
    gc.collect()
    gc.freeze()
