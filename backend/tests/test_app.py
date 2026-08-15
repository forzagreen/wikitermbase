import pytest
from app import (
    aggregate_terms,
    normalise_arabic,
    normalise_english,
    normalise_french,
    query_matches_term,
    split_translations,
)


@pytest.mark.parametrize(
    "input_text, expected_output",
    [
        ("الكَلِمَةُ", "كلمة"),
        ("  كــلــمــة  ", "كلمة"),
        ("كلمة (قوس)", "كلمة"),
        ("AB كلمة098 d", "كلمة"),
        ("إنتاجية", "انتاجية"),
    ],
)
def test_normalise_arabic(input_text, expected_output):
    assert normalise_arabic(input_text) == expected_output


@pytest.mark.parametrize(
    "input_text, expected_output",
    [
        ("  term  spaces  ", "term spaces"),
    ],
)
def test_normalise_english(input_text, expected_output):
    assert normalise_english(input_text) == expected_output


@pytest.mark.parametrize(
    "input_text, expected_output",
    [("ciel (m.)", "ciel"), ("ciel [m.]", "ciel"), ("  lune [f.]", "lune")],
)
def test_normalise_french(input_text, expected_output):
    assert normalise_french(input_text) == expected_output


INPUT_1 = [
    {
        "arabic": "أسد (ال...)",
        "english": "lion (the)",
        "french": "le lion",
        "dictionary_id": 1,
        "relevance": 1.0,
    },
    {
        "arabic": "أسد",
        "english": "lion",
        "french": "lion",
        "dictionary_id": 2,
        "relevance": 1.0,
    },
    {
        "arabic": "أسد (ال...)",
        "english": "leo",
        "french": "le lion",
        "dictionary_id": 1,
        "relevance": 1.0,
    },
    {  # المورد الحديث
        "english": "lion",
        "dictionary_id": 3,
        "relevance": 1.0,
    },
    {
        "arabic": "أسد النمل",
        "english": "ant-lion",
        "french": "fourmi-lion",
        "dictionary_id": 2,
        "relevance": 0.9,
    },
]

OUTPUT_1 = [
    {
        "arabic_normalised": "أسد (ال...)",
        "english_normalised": "lion (the)",
        "french_normalised": "le lion",
        "dictionary_ids": [1, 2],
        "total_relevance": 3.0,
        "occurences": INPUT_1[0:3],
    },
    {
        "english_normalised": "lion",
        "dictionary_ids": [3],
        "total_relevance": 1.0,
        "occurences": INPUT_1[3:4],
    },
    {
        "arabic_normalised": "أسد النمل",
        "english_normalised": "ant-lion",
        "french_normalised": "fourmi-lion",
        "dictionary_ids": [2],
        "total_relevance": 0.9,
        "occurences": INPUT_1[4:5],
    },
]

INPUT_2 = [
    {
        "arabic": "سحابة الكترونية",
        "dictionary_id": 669,
        "english": "electron cloud",
        "french": "nuage électronique",
        "relevance": 1.0,
    },
    {
        "arabic": "سحابة الكترونية",
        "dictionary_id": 670,
        "english": "electron cloud",
        "french": "nuage électronique",
        "relevance": 1.0,
    },
]
OUTPUT_2 = [
    {
        "arabic_normalised": "سحابة الكترونية",
        "dictionary_ids": [669, 670],
        "english_normalised": "electron cloud",
        "french_normalised": "nuage électronique",
        "occurences": INPUT_2,
        "total_relevance": 2.0,
    }
]

INPUT_3 = [
    {
        "arabic": "المدرسة",
        "english": "a",
        "french": "a",
        "dictionary_id": 1,
        "relevance": 3.0,
    },
    {
        "arabic": "المَدرسَة.  ",
        "english": "a",
        "french": "a",
        "dictionary_id": 2,
        "relevance": 2.0,
    },
    {
        "arabic": "كتاب",
        "english": "b",
        "french": "b",
        "dictionary_id": 3,
        "relevance": 1.0,
    },
]
OUTPUT_3 = [
    {
        "arabic_normalised": "المدرسة",
        "dictionary_ids": [1, 2],
        "english_normalised": "a",
        "french_normalised": "a",
        "occurences": INPUT_3[0:2],
        "total_relevance": 5.0,
    },
    {
        "arabic_normalised": "كتاب",
        "dictionary_ids": [3],
        "english_normalised": "b",
        "french_normalised": "b",
        "occurences": INPUT_3[2:3],
        "total_relevance": 1.0,
    },
]

INPUT_4 = [
    {
        "arabic": "إنتاجية",
        "english": "productivity",
        "french": "productivité",
        "dictionary_id": 1,
        "relevance": 3.0,
    },
    {
        "arabic": "انتاجية",
        "english": "productivity",
        "french": "productivité",
        "dictionary_id": 2,
        "relevance": 2.0,
    },
]
OUTPUT_4 = [
    {
        "arabic_normalised": "إنتاجية",
        "dictionary_ids": [1, 2],
        "english_normalised": "productivity",
        "french_normalised": "productivité",
        "occurences": INPUT_4,
        "total_relevance": 5.0,
    },
]


@pytest.mark.parametrize(
    "input_list, output_list",
    [
        (INPUT_1, OUTPUT_1),
        (INPUT_2, OUTPUT_2),
        (INPUT_3, OUTPUT_3),
        (INPUT_4, OUTPUT_4),
    ],
)
def test_aggregate_terms(input_list, output_list):
    returned_list = aggregate_terms(input_list)
    assert returned_list == output_list


def test_aggregate_terms_orders_occurences_by_dict_type_then_tier():
    # dictionary_id order below is deliberately scrambled relative to the
    # expected output, so a passing test proves sorting actually happened.
    thesaurus_tier1 = {
        "arabic": "شجرة",
        "english": "tree",
        "dictionary_id": 1,
        "dictionary_dict_type": "thesaurus",
        "dictionary_tier": 1,
        "relevance": 1.0,
    }
    language_tier2 = {
        "arabic": "شجرة",
        "english": "tree",
        "dictionary_id": 2,
        "dictionary_dict_type": "language",
        "dictionary_tier": 2,
        "relevance": 1.0,
    }
    terminology_tier3 = {
        "arabic": "شجرة",
        "english": "tree",
        "dictionary_id": 3,
        "dictionary_dict_type": "terminology",
        "dictionary_tier": 3,
        "relevance": 1.0,
    }
    terminology_tier1 = {
        "arabic": "شجرة",
        "english": "tree",
        "dictionary_id": 4,
        "dictionary_dict_type": "terminology",
        "dictionary_tier": 1,
        "relevance": 1.0,
    }
    unclassified = {
        "arabic": "شجرة",
        "english": "tree",
        "dictionary_id": 5,
        "relevance": 1.0,
    }

    groups = aggregate_terms(
        [
            thesaurus_tier1,
            language_tier2,
            terminology_tier3,
            terminology_tier1,
            unclassified,
        ]
    )

    assert [o["dictionary_id"] for o in groups[0]["occurences"]] == [4, 3, 2, 1, 5]


@pytest.mark.parametrize(
    "input_text, expected_output",
    [
        ("تلسكوب، مِقْراب", ["تلسكوب", "مِقْراب"]),
        ("مُشترِك، مستهلِك، مستعمِل", ["مُشترِك", "مستهلِك", "مستعمِل"]),
        ("مِقراب؛ راصدة", ["مِقراب", "راصدة"]),
        ("landslide; landslip", ["landslide", "landslip"]),
        ("ordinateur; calculatrice", ["ordinateur", "calculatrice"]),
        ("container/dumpster", ["container", "dumpster"]),
        ("  a  ;  b  /c", ["a", "b", "c"]),
        ("مقراب", ["مقراب"]),
        # A plain ',' is NOT a separator: this dataset also uses it for
        # headword inversion ("profile, hydraulic") and gender/POS
        # annotations ("vitesse commerciale, f"), so splitting on it would
        # fabricate bogus translations.
        ("profile, hydraulic", ["profile, hydraulic"]),
    ],
)
def test_split_translations(input_text, expected_output):
    assert split_translations(input_text) == expected_output


def test_query_matches_term_exact_arabic_part():
    term = {"arabic": "تلسكوب، مِقْراب", "english": "telescope"}
    assert query_matches_term(term, "مقراب") is True
    assert query_matches_term(term, "تلسكوب") is True
    assert query_matches_term(term, "مرصد") is False


def test_query_matches_term_exact_translation_part_case_insensitive():
    term = {
        "arabic": "انزلاق التربة",
        "english": "landslide; landslip",
        "french": "éboulement",
    }
    assert query_matches_term(term, "Landslide") is True
    assert query_matches_term(term, "landslip") is True
    assert query_matches_term(term, "landslides") is False


def test_query_matches_term_strips_quoted_query():
    # The frontend and gadget both send q=`"${term}"` (literal quotes).
    term = {"english": "telescope"}
    assert query_matches_term(term, '"telescope"') is True


def test_query_matches_term_not_fooled_by_compound_phrase():
    term = {"english": "reflecting telescope"}
    assert query_matches_term(term, "telescope") is False


def test_query_matches_term_empty_query():
    assert query_matches_term({"english": "telescope"}, "") is False


def test_aggregate_terms_packed_row_joins_each_variants_group_separately():
    # id=140327-like row: a plain, single-spelling entry.
    plain_telescope = {
        "arabic": "مقراب",
        "english": "telescope",
        "dictionary_id": 1,
        "relevance": 1.0,
    }
    # id=504832-like: packs two synonymous Arabic spellings in one field.
    # "مِقراب" should join the group above; "راصدة" has no other entry
    # anywhere, but still gets its own (single-occurrence) group rather
    # than being folded into "مقراب"'s.
    packed = {
        "arabic": "مِقراب؛ راصدة",
        "english": "telescope",
        "dictionary_id": 2,
        "relevance": 1.0,
    }
    groups = aggregate_terms([plain_telescope, packed])
    groups_by_key = {g["arabic_normalised"]: g for g in groups}

    assert set(groups_by_key) == {"مقراب", "راصدة"}

    miqrab_group = groups_by_key["مقراب"]
    assert miqrab_group["dictionary_ids"] == [1, 2]
    assert {o["dictionary_id"] for o in miqrab_group["occurences"]} == {1, 2}

    rasida_group = groups_by_key["راصدة"]
    assert rasida_group["dictionary_ids"] == [2]
    # The virtual occurrence still shows the full, original citation.
    assert rasida_group["occurences"][0]["arabic"] == "مِقراب؛ راصدة"


def test_aggregate_terms_does_not_transitively_merge_unrelated_groups():
    # A row bundling two variants must NOT fuse those two variants' groups
    # into one -- each variant's group stays independent.
    hub = {
        "arabic": "أ؛ ب",
        "english": "hub",
        "dictionary_id": 1,
        "relevance": 1.0,
    }
    only_a = {
        "arabic": "أ",
        "english": "only a",
        "dictionary_id": 2,
        "relevance": 1.0,
    }
    only_b = {
        "arabic": "ب",
        "english": "only b",
        "dictionary_id": 3,
        "relevance": 1.0,
    }
    groups = aggregate_terms([hub, only_a, only_b])
    groups_by_key = {g["arabic_normalised"]: g for g in groups}

    assert set(groups_by_key) == {"أ", "ب"}
    assert {o["dictionary_id"] for o in groups_by_key["أ"]["occurences"]} == {1, 2}
    assert {o["dictionary_id"] for o in groups_by_key["ب"]["occurences"]} == {1, 3}


def test_aggregate_terms_bubbles_exact_match_to_top():
    # id=134457-like: a single-dictionary exact match for "telescope".
    exact_match = {
        "arabic": "مرقب",
        "english": "telescope",
        "dictionary_id": 1,
        "relevance": 10.0,
    }
    # A compound phrase spread across two dictionaries -- more supporting
    # dictionaries than the exact match, but not itself an exact match.
    compound_a = {
        "arabic": "مقراب عاكس",
        "english": "reflecting telescope",
        "dictionary_id": 2,
        "relevance": 10.0,
    }
    compound_b = {
        "arabic": "مقراب عاكس",
        "english": "reflecting telescope",
        "dictionary_id": 3,
        "relevance": 10.0,
    }

    groups = aggregate_terms([exact_match, compound_a, compound_b], "telescope")

    assert groups[0]["arabic_normalised"] == "مرقب"
    assert groups[1]["arabic_normalised"] == "مقراب عاكس"
