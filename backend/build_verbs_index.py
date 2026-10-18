"""Rebuild backend/data/arabic_verbs.json.gz from M-Bakni/arabic-morphology.

The source is the unified table the dataset's site serves (``site/verbs.json``,
one row per verb: vowelled past form, root, triliteral/quadriliteral, bare or
augmented, pattern, transitivity, root class). Here it is re-indexed by root so
that the morphology endpoint can list the verbs of a root in one lookup. Roots
are keyed in the spelling farahidi uses (every hamza seat written ء, see
``canonical_root`` in morphology.py); the table itself writes أ.

Run: uv run python backend/build_verbs_index.py
Dataset: https://github.com/M-Bakni/arabic-morphology (CC BY 4.0, Bawwab &
Mir Alam; Bakni & Tellat).
"""

import gzip
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from morphology import VERBS_INDEX_PATH, canonical_root  # noqa: E402

SOURCE_URL = (
    "https://raw.githubusercontent.com/M-Bakni/arabic-morphology/main/site/verbs.json"
)
# Columns kept per verb, in this order (``pattern`` is a mazini wazn name).
FIELDS = ["verb", "pattern", "trans", "deriv", "type"]


def main():
    with urllib.request.urlopen(SOURCE_URL, timeout=120) as response:
        data = json.load(response)
    source_fields = data["fields"]
    index = {}
    for row in data["rows"]:
        record = dict(zip(source_fields, row))
        root = canonical_root(record["root"])
        index.setdefault(root, []).append([record[f] for f in FIELDS])
    payload = {"source": SOURCE_URL, "fields": FIELDS, "roots": index}
    with gzip.open(VERBS_INDEX_PATH, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    n_verbs = sum(len(v) for v in index.values())
    print(f"{len(index)} roots, {n_verbs} verbs -> {VERBS_INDEX_PATH}")


if __name__ == "__main__":
    main()
