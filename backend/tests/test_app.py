import pytest
from app import aggregate_terms, normalise_arabic, normalise_english, normalise_french


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
