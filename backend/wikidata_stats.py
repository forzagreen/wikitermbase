"""Copy the live term and dictionary counts to WikiTermBase's Wikidata item.

Run by CI after each DB import (`make wikidata_stats`), so that the project page
[[ويكيبيديا:مسرد الويكي]] can read its figures from Wikidata instead of having
them typed by hand. Two statements on Q133800945 are kept in sync with
/api/v1/stats:

- P4876 (number of records) = number of terms
- P2670 (has part(s) of the class) = Q23622 (dictionary),
  with qualifier P1114 (quantity) = number of dictionaries

Both carry P585 (point in time) and a reference to the stats endpoint (P854 +
P813 retrieved). They are overwritten in place, not appended: the dump is
refreshed several times a week and the item's revision history already keeps
the old values. Nothing is edited when Wikidata already has the live counts, so
re-running is a no-op. The statements are created on the first run.

Credentials are a bot password (Special:BotPasswords on wikidata.org, grant
"Edit existing pages"): WIKIDATA_USERNAME ("User@BotName") and WIKIDATA_PASSWORD.
`--dry-run` needs neither and prints the edit it would make.
"""

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime

import httpx

ITEM = "Q133800945"
DICTIONARY = "Q23622"
STATS_URL = "https://wikitermbase.toolforge.org/api/v1/stats"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
GREGORIAN = "http://www.wikidata.org/entity/Q1985727"
USER_AGENT = "wikitermbase-stats/1.0 (https://github.com/forzagreen/wikitermbase)"

# The stats request can land on a webservice restart (deploy-code runs first).
STATS_ATTEMPTS = 5
STATS_RETRY_DELAY = 15
MAXLAG = 5
MAXLAG_ATTEMPTS = 5


def snak(prop, value, value_type):
    return {
        "snaktype": "value",
        "property": prop,
        "datavalue": {"value": value, "type": value_type},
    }


def quantity_snak(prop, amount):
    return snak(prop, {"amount": f"+{amount}", "unit": "1"}, "quantity")


def day_snak(prop, day):
    value = {
        "time": f"+{day.isoformat()}T00:00:00Z",
        "timezone": 0,
        "before": 0,
        "after": 0,
        "precision": 11,  # day
        "calendarmodel": GREGORIAN,
    }
    return snak(prop, value, "time")


def item_snak(prop, qid):
    value = {"entity-type": "item", "numeric-id": int(qid[1:]), "id": qid}
    return snak(prop, value, "wikibase-entityid")


def snak_value(s):
    return s["datavalue"]["value"] if s.get("snaktype") == "value" else None


def managed_statement(claims, prop, value_id=None):
    """The statement this script maintains for `prop` (and object `value_id`).

    The preferred one if there is one, else the first non-deprecated one: that
    is what `{{#property}}` and WikidataIB's `rank=best` show on Wikipedia.
    """
    candidates = [
        s
        for s in claims.get(prop, [])
        if s["rank"] != "deprecated"
        and (
            value_id is None or (snak_value(s["mainsnak"]) or {}).get("id") == value_id
        )
    ]
    preferred = [s for s in candidates if s["rank"] == "preferred"]
    return (preferred or candidates or [None])[0]


def published_counts(claims):
    """The counts currently on Wikidata, None where a statement is missing."""

    def amount(s):
        value = snak_value(s) if s else None
        return int(value["amount"]) if value else None

    terms = managed_statement(claims, "P4876")
    dicts = managed_statement(claims, "P2670", DICTIONARY)
    return {
        "number_terms": amount(terms["mainsnak"]) if terms else None,
        "number_dictionaries": (
            amount(dicts.get("qualifiers", {}).get("P1114", [None])[0])
            if dicts
            else None
        ),
    }


def build_statements(claims, stats, day):
    """Full JSON of both statements, reusing the ids of the existing ones."""

    def statement(existing, mainsnak, qualifiers):
        result = {
            "type": "statement",
            "mainsnak": mainsnak,
            "rank": existing["rank"] if existing else "normal",
            "qualifiers": {q["property"]: [q] for q in qualifiers},
            "references": [
                {
                    "snaks": {
                        "P854": [snak("P854", STATS_URL, "string")],
                        "P813": [day_snak("P813", day)],
                    }
                }
            ],
        }
        if existing:
            result["id"] = existing["id"]
        return result

    return [
        statement(
            managed_statement(claims, "P4876"),
            quantity_snak("P4876", stats["number_terms"]),
            [day_snak("P585", day)],
        ),
        statement(
            managed_statement(claims, "P2670", DICTIONARY),
            item_snak("P2670", DICTIONARY),
            [
                quantity_snak("P1114", stats["number_dictionaries"]),
                day_snak("P585", day),
            ],
        ),
    ]


def fetch_stats(client):
    for attempt in range(1, STATS_ATTEMPTS + 1):
        try:
            response = client.get(STATS_URL)
            response.raise_for_status()
            stats = response.json()
            break
        except (httpx.HTTPError, ValueError) as e:
            if attempt == STATS_ATTEMPTS:
                raise
            print(f"Stats unavailable ({e}), retrying in {STATS_RETRY_DELAY}s")
            time.sleep(STATS_RETRY_DELAY)
    # A half-imported or empty database must not wipe the figures on Wikipedia.
    for key in ("number_terms", "number_dictionaries"):
        if not isinstance(stats.get(key), int) or stats[key] <= 0:
            raise ValueError(f"Refusing to publish {key}={stats.get(key)!r}")
    return stats


def wikidata(client, method, **params):
    """Call the Wikidata API, waiting out maxlag, raising on API errors."""
    params |= {"format": "json", "formatversion": 2, "maxlag": MAXLAG}
    for _ in range(MAXLAG_ATTEMPTS):
        if method == "GET":
            response = client.get(WIKIDATA_API, params=params)
        else:
            response = client.post(WIKIDATA_API, data=params)
        response.raise_for_status()
        body = response.json()
        error = body.get("error")
        if error and error.get("code") == "maxlag":
            time.sleep(int(response.headers.get("Retry-After", MAXLAG)))
            continue
        if error:
            raise RuntimeError(
                f"Wikidata API error: {error.get('code')}: {error.get('info')}"
            )
        return body
    raise RuntimeError("Wikidata is lagging, giving up")


def login(client, username, password):
    """Log in with a bot password and return a CSRF token."""
    tokens = wikidata(client, "GET", action="query", meta="tokens", type="login")
    result = wikidata(
        client,
        "POST",
        action="login",
        lgname=username,
        lgpassword=password,
        lgtoken=tokens["query"]["tokens"]["logintoken"],
    )["login"]
    if result["result"] != "Success":
        raise RuntimeError(
            f"Wikidata login failed: {result.get('reason', result['result'])}"
        )
    tokens = wikidata(client, "GET", action="query", meta="tokens", type="csrf")
    return tokens["query"]["tokens"]["csrftoken"]


def sync(client, username=None, password=None, dry_run=False, today=None):
    """Bring the Wikidata item in line with the live stats. Returns an exit code."""
    stats = fetch_stats(client)
    entity = wikidata(
        client, "GET", action="wbgetentities", ids=ITEM, props="claims|info"
    )
    entity = entity["entities"][ITEM]
    published = published_counts(entity.get("claims", {}))
    print(
        f"Live:     {stats['number_terms']} terms, {stats['number_dictionaries']} dictionaries"
    )
    print(
        f"Wikidata: {published['number_terms']} terms, "
        f"{published['number_dictionaries']} dictionaries"
    )
    if all(published[key] == stats[key] for key in published):
        print("Wikidata is up to date")
        return 0

    statements = build_statements(
        entity.get("claims", {}), stats, today or datetime.now(UTC).date()
    )
    if dry_run:
        print(json.dumps({"claims": statements}, ensure_ascii=False, indent=2))
        return 0
    if not (username and password):
        print("WIKIDATA_USERNAME and WIKIDATA_PASSWORD must be set", file=sys.stderr)
        return 1

    token = login(client, username, password)
    result = wikidata(
        client,
        "POST",
        action="wbeditentity",
        id=ITEM,
        data=json.dumps({"claims": statements}),
        baserevid=entity["lastrevid"],
        summary=(
            f"WikiTermBase statistics: {stats['number_terms']:,} terms, "
            f"{stats['number_dictionaries']} dictionaries ({STATS_URL})"
        ),
        token=token,
        **{"assert": "user"},  # never edit logged out
    )
    print(
        f"Updated https://www.wikidata.org/w/index.php?diff={result['entity']['lastrevid']}"
    )
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dry-run", action="store_true", help="print the edit, don't make it"
    )
    args = parser.parse_args(argv)
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
        return sync(
            client,
            os.environ.get("WIKIDATA_USERNAME"),
            os.environ.get("WIKIDATA_PASSWORD"),
            dry_run=args.dry_run,
        )


if __name__ == "__main__":
    sys.exit(main())
