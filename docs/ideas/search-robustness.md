# Search robustness — ideas backlog

Status: **not started** (discussed 2026-09-14, parked for later).

Context: ~90% of queries are English terms looking for an Arabic translation.
So the priority is English-side robustness; French comes almost for free;
Arabic is a separate, smaller branch.

## What the DB already gives us

- Fulltext index: InnoDB, `(arabic, english, french, description)`,
  `NATURAL LANGUAGE MODE`. No stemming, tokens < 3 chars are dropped
  (`innodb_ft_min_token_size`, not changeable on ToolsDB), default stopwords.
- Collation `utf8mb4_unicode_520_ci`: case- **and accent-insensitive** at the
  primary level → `reseau` already matches `réseau`; Arabic harakat and
  hamza-on-alif forms are very likely already folded. Probable remaining Arabic
  gaps at this layer: `ة`≠`ه`, `ى`≠`ي`. (Verify with a query before relying on it.)
- `Procfile` runs 4 gunicorn workers → anything held in Python memory is ×4.
  Prefer DB-side indexes over in-process tries.

## Architecture

One function `expand_query(q) -> list[str]` turns the user's input into a bag
of real words (original tokens + lemmas + spelling variants), joined with
spaces and sent to the existing `MATCH … AGAINST`. Natural-language mode OR's
the tokens and ranks by TF-IDF, so appending variants is safe — no BOOLEAN
MODE, no wildcards.

Also teach `query_matches_term()` to compare against the lemmatized query, so
"boundary conditions" still gets the exact-match boost on the entry
"boundary condition".

## Tools per feature

| Feature | Tool | Notes |
|---|---|---|
| Lemmatization (plural→singular, verb forms) | `simplemma` | Pure Python, no deps, dictionary-based, supports **en, fr, ar**. Accepts a language chain `lang=("en","fr")` so no en/fr detection needed. Lazy per-language data, a few MB each. |
| British/American | ~12 regex rules + small exceptions list | `-our/-or`, `-ise/-ize`, `-isation/-ization`, `-re/-er`, `ae/oe→e`, `-ll-/-l-`; exceptions: aluminium, sulphur… Matters most for technical vocabulary (haemoglobin, oesophagus, analyse, centre). |
| Hyphen/space/joined | generate variants | `e-mail` → `email`, `e mail`. |
| Autocomplete | B-tree prefix indexes + `LIKE 'prefix%'` | `ALTER TABLE term ADD INDEX (english(40)), ADD INDEX (french(40)), ADD INDEX (arabic(40))` — in arabterm's schema or in `make fix_dump`. Collation gives case/accent insensitivity for free. New endpoint `/api/v1/suggest?q=`, frontend dropdown. Also solves the < 3-char problem (`pH`, `AI`) since exact/prefix hits come from the B-tree, not fulltext. |
| Did-you-mean (zero results only) | `rapidfuzz` over a pruned candidate set | Candidates via `LIKE 'c%'` (same first letter) with `LENGTH` ±2 → a few thousand rows; score with `fuzz.WRatio`; show top 3 above 85. Avoids holding 500k strings ×4 workers. |

Deliberately skipped: Snowball stemmers (stems like `studi` aren't real tokens
→ would need `studi*` in boolean mode, whose ranking is worse), `inflect`
(English-only, simplemma covers it), spaCy (too heavy for a Toolforge build).

## Per language

**English — easy.** Everything above applies. Biggest wins: singularization and
British/American. ~150 lines + tests.

**French — easy, mostly free.** Accents handled by the collation. simplemma's
French lemmatizer is good (réseaux→réseau, électriques→électrique). Extras:
strip elided articles (`l'ordinateur`, `d'onde`), normalize `œ`→`oe`.
`normalise_french` already strips `(m.)`/`(f.)`. Since en/fr share a script,
lemmatize with the chain `("en","fr")` and add both results.

**Arabic — medium, separate branch** (fires only on Arabic-script queries):
- `ال` prefix: fulltext tokens include it, so `مكتبة` misses `المكتبة`. Add both
  variants to the bag. (`normalise_arabic` strips it only for the Python
  exact-match step, not for the DB query.)
- Plurals/inflection (`مكتبات`→`مكتبة`, broken plurals `كتب`→`كتاب`): simplemma's
  Arabic is weak; use **`farahidi`** (own tool, pure Python, pip) for the lemma.
- `ة/ه` and `ى/ي` final-letter variants: two regexes.

Caveat: farahidi's wheel embeds an 11 MB compressed lexicon; expanded in memory
it's tens of MB, ×4 workers. Mitigate by lazy-loading on first Arabic query, or
by running 2 workers × threads. Measure first; Toolforce `--mem` is adjustable.

## Suggested order

1. English + French: simplemma + spelling rules + the `query_matches_term` fix.
2. Autocomplete (needs the index change coordinated with arabterm).
3. Arabic branch (ال variants + farahidi lemma + final-letter variants).
