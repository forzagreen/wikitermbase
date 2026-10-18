import unicodedata

import morphology
import pytest
from app import MAX_QUERY_LENGTH, app
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.mark.parametrize(
    "root, expected",
    [("أكسد", "ءكسد"), ("سأل", "سءل"), ("بيئ", "بيء"), ("كتب", "كتب")],
)
def test_canonical_root(root, expected):
    assert morphology.canonical_root(root) == expected


def test_term_words_keeps_arabic_only_and_caps_their_number():
    assert morphology.term_words("خلية (نباتية) cell") == ["خلية", "نباتية"]
    # Vowelled entries stay whole words (the vowels narrow the readings).
    assert morphology.term_words("خَلِيَّة جِذْعِيَّة، كــلمة") == ["خَلِيَّة", "جِذْعِيَّة", "كــلمة"]


def test_analyze_word_vowelled_input():
    # Vowels narrow the readings when the lexicon agrees with them...
    assert [r["lemma"] for r in morphology.analyze_word("شَبَكَة")["readings"]] == ["شَبَكَة"]
    narrowed = morphology.analyze_word("خَلِيّة")["readings"]
    assert 1 < len(narrowed) < len(morphology.analyze_word("خلية")["readings"])
    # Among tied readings the one that is its own lemma leads (اسم جامد
    # خَلِيَّة, not the نسبة خَلِيّ + ة), whatever order farahidi enumerates.
    assert narrowed[0]["lemma"] == narrowed[0]["diacritized"]
    assert narrowed[0]["type"] == "اسم جامد"
    # ...and are dropped when they match nothing (farahidi reads no word with
    # a vowel after the shadda), rather than losing the word.
    odd = morphology.analyze_word("خَلِيَّة")
    assert odd["analyzed"] and odd["word"] == "خَلِيَّة"
    assert len(odd["readings"]) == len(morphology.analyze_word("خلية")["readings"])
    # Tatweel is never part of the word.
    assert (
        morphology.analyze_word("كــلمة")["readings"][0]["lemma"]
        == morphology.analyze_word("كلمة")["readings"][0]["lemma"]
    )
    assert (
        morphology.term_words("ال" + " ".join(["كلمة"] * 12))
        == ["الكلمة"] + ["كلمة"] * 7
    )


def test_analyze_word_prefers_bare_nominal_readings():
    # farahidi ranks the verb ضَغَطَ first by corpus score; a dictionary
    # headword is a noun, so the مصدر comes first here.
    word = morphology.analyze_word("ضغط")
    assert word["analyzed"]
    assert word["readings"][0]["lemma"] == "ضَغْط"
    assert word["readings"][0]["pos"] == "اسم"
    assert word["roots"] == ["ضغط"]
    # A proper-noun reading scores above the common noun; the term is a noun.
    assert morphology.analyze_word("ذاكرة")["readings"][0]["type"] != "اسم علم"
    # Readings with clitics come after the bare ones.
    clitic_free = [
        not (r["proclitics"] or r["enclitics"])
        for r in morphology.analyze_word("بالمدرسة")["readings"]
    ]
    assert clitic_free == sorted(clitic_free, reverse=True)


def test_analyze_word_dedupes_identical_readings():
    readings = morphology.analyze_word("خلية")["readings"]
    identities = [morphology._reading_identity(r) for r in readings]
    assert len(identities) == len(set(identities))
    # The lexicon spells the same lemma in several entries; each stays one reading.
    assert ("اسم جامد", "خلو") in [(r["type"], r["root"]) for r in readings]


def test_analyze_word_unknown_word():
    assert morphology.analyze_word("مكروسكوب") == {
        "word": "مكروسكوب",
        "analyzed": False,
        "readings": [],
        "roots": [],
    }


def test_verbs_of_root_accepts_either_hamza_spelling():
    verbs = morphology.verbs_of_root("أكسد")
    assert [v["verb"] for v in verbs] == ["أَكْسَدَ", "تَأَكْسَدَ"]
    assert verbs == morphology.verbs_of_root("ءكسد")
    assert verbs[0]["pattern"] == "فعلل" and verbs[0]["trans"] == "m"
    assert morphology.verbs_of_root("xyz") == []


def test_analyze_term_lists_verbs_for_every_proposed_root():
    result = morphology.analyze_term("حاسوب")
    assert [w["word"] for w in result["words"]] == ["حاسوب"]
    assert result["words"][0]["readings"][0]["root"] == "حسب"
    assert set(result["verbs"]) == {"حسب"}
    assert "حَسَبَ" in [v["verb"] for v in result["verbs"]["حسب"]]


def test_endpoint(client):
    response = client.get("/api/v1/morphology", params={"q": "شبكة حاسوبية"})
    assert response.status_code == 200
    data = response.json()
    assert data["term"] == "شبكة حاسوبية"
    assert [w["word"] for w in data["words"]] == ["شبكة", "حاسوبية"]
    first = data["words"][0]["readings"][0]
    assert first["root"] == "شبك" and first["pattern"]
    assert set(data["verbs"]) == {"شبك", "حسب"}


def test_endpoint_rejects_empty_and_over_long_queries(client):
    assert client.get("/api/v1/morphology", params={"q": ""}).status_code == 422
    assert (
        client.get(
            "/api/v1/morphology", params={"q": "ا" * (MAX_QUERY_LENGTH + 1)}
        ).status_code
        == 422
    )
