import json
from datetime import date
from urllib.parse import parse_qs

import httpx
import pytest
from wikidata_stats import (
    DICTIONARY,
    ITEM,
    STATS_URL,
    build_statements,
    item_snak,
    managed_statement,
    published_counts,
    quantity_snak,
    sync,
)

DAY = date(2026, 9, 26)
LIVE = {"number_terms": 509871, "number_dictionaries": 85}


def statement(guid, mainsnak, rank="normal", qualifiers=()):
    return {
        "id": f"{ITEM}${guid}",
        "type": "statement",
        "rank": rank,
        "mainsnak": mainsnak,
        "qualifiers": {q["property"]: [q] for q in qualifiers},
    }


def claims(terms=None, dictionaries=None):
    """An item holding the given counts (None leaves the statement out)."""
    result = {"P2670": [statement("other", item_snak("P2670", "Q5"))]}
    if terms is not None:
        result["P4876"] = [statement("terms", quantity_snak("P4876", terms))]
    if dictionaries is not None:
        result["P2670"].append(
            statement(
                "dicts",
                item_snak("P2670", DICTIONARY),
                qualifiers=[quantity_snak("P1114", dictionaries)],
            )
        )
    return result


def test_managed_statement_prefers_preferred_and_skips_deprecated():
    statements = {
        "P4876": [
            statement("old", quantity_snak("P4876", 1), rank="deprecated"),
            statement("normal", quantity_snak("P4876", 2)),
            statement("best", quantity_snak("P4876", 3), rank="preferred"),
        ]
    }
    assert managed_statement(statements, "P4876")["id"].endswith("$best")
    statements["P4876"].pop()
    assert managed_statement(statements, "P4876")["id"].endswith("$normal")
    assert managed_statement({}, "P4876") is None


def test_published_counts():
    assert published_counts(claims(509871, 85)) == LIVE
    assert published_counts(claims()) == {
        "number_terms": None,
        "number_dictionaries": None,
    }


def test_build_statements_reuses_existing_ids():
    terms, dicts = build_statements(claims(1, 2), LIVE, DAY)
    assert terms["id"] == f"{ITEM}$terms"
    assert terms["mainsnak"]["datavalue"]["value"] == {"amount": "+509871", "unit": "1"}
    assert (
        terms["qualifiers"]["P585"][0]["datavalue"]["value"]["time"]
        == "+2026-09-26T00:00:00Z"
    )
    assert dicts["id"] == f"{ITEM}$dicts"
    assert dicts["mainsnak"]["datavalue"]["value"]["id"] == DICTIONARY
    assert dicts["qualifiers"]["P1114"][0]["datavalue"]["value"]["amount"] == "+85"
    for s in (terms, dicts):
        assert s["references"][0]["snaks"]["P854"][0]["datavalue"]["value"] == STATS_URL


def test_build_statements_creates_missing_ones():
    for s in build_statements(claims(), LIVE, DAY):
        assert "id" not in s
        assert s["rank"] == "normal"


class FakeWikis:
    """Serves the stats endpoint and just enough of the Wikidata API."""

    def __init__(self, item_claims, stats=LIVE):
        self.item_claims = item_claims
        self.stats = stats
        self.actions = []
        self.edit = None

    def __call__(self, request):
        if str(request.url) == STATS_URL:
            return httpx.Response(200, json=self.stats)
        params = dict(request.url.params) | {
            k: v[0] for k, v in parse_qs(request.content.decode()).items()
        }
        action = params.get("action")
        self.actions.append(f"{params['type']}token" if action == "query" else action)
        if action == "wbgetentities":
            entity = {"id": ITEM, "lastrevid": 42, "claims": self.item_claims}
            return httpx.Response(200, json={"entities": {ITEM: entity}})
        if action == "query":
            token = f"{params['type']}token"
            return httpx.Response(200, json={"query": {"tokens": {token: "t"}}})
        if action == "login":
            return httpx.Response(200, json={"login": {"result": "Success"}})
        if action == "wbeditentity":
            self.edit = params
            return httpx.Response(200, json={"success": 1, "entity": {"lastrevid": 43}})
        raise AssertionError(f"unexpected request {request.url}")


def run(fake, **kwargs):
    with httpx.Client(transport=httpx.MockTransport(fake)) as client:
        return sync(client, "User@ci", "secret", today=DAY, **kwargs)


def test_sync_does_not_edit_when_up_to_date():
    fake = FakeWikis(claims(509871, 85))
    assert run(fake) == 0
    assert fake.actions == ["wbgetentities"]


def test_sync_edits_both_statements_in_one_revision():
    fake = FakeWikis(claims(500000, 85))
    assert run(fake) == 0
    assert fake.actions == [
        "wbgetentities",
        "logintoken",
        "login",
        "csrftoken",
        "wbeditentity",
    ]
    assert fake.edit["id"] == ITEM
    assert fake.edit["baserevid"] == "42"
    assert fake.edit["assert"] == "user"
    sent = json.loads(fake.edit["data"])["claims"]
    assert [s["id"] for s in sent] == [f"{ITEM}$terms", f"{ITEM}$dicts"]


def test_sync_dry_run_does_not_log_in():
    fake = FakeWikis(claims())
    assert run(fake, dry_run=True) == 0
    assert fake.actions == ["wbgetentities"]


@pytest.mark.parametrize("stats", [{"number_terms": 0, "number_dictionaries": 85}, {}])
def test_sync_refuses_empty_stats(stats):
    with pytest.raises(ValueError, match="Refusing to publish"):
        run(FakeWikis(claims(), stats=stats))
