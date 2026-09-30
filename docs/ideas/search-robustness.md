# Search robustness — ideas backlog

Status: **step 1 (English + French query expansion) implemented on
2026-09-21**, see `expand_query` in `backend/app.py`. Steps 2 and 3 below
are still open. Discussed 2026-09-14, parked, then revised 2026-09-21 after
measuring the assumptions against production (findings below).

Context: ~90% of queries are English terms looking for an Arabic translation.
So the priority is English-side robustness; French comes almost for free;
Arabic is a separate, smaller branch.

## Findings — read before touching this

Measured on production (`/api/v1/search`, so through the same `MATCH …
AGAINST` the app uses) on 2026-09-19 (pagination work) and 2026-09-21 (this
step). They overturned several assumptions of the original plan.

**Quoting and phrase search.**
- Quotes are a phrase search, not ignored. The web UI and both gadgets send
  `q="term"` with literal quotes, and InnoDB honours them even in
  natural-language mode: `"data system"` → 6 rows; unquoted it ORs the tokens →
  4,193.
- **Several quoted phrases in natural-language mode match their union**:
  `"data system" "data systems"` → 8 rows (6 + 2), `"boundary condition"
  "boundary conditions"` → 8 (3 + 5), `"telescopes" "telescope"` → 57 (0 + 57).
  This is what makes expansion cheap: each variant is sent as its own phrase,
  the query keeps its phrase semantics, and the multi-word-OR relevance change
  (and the Arabic stopword problem below) never arises. The original plan
  ("append variants to a bag of tokens") was dropped for this.
- Relevance is close to a raw term frequency. For `نظام`, 6,347 rows share 13
  distinct scores and 80% tie on one; the 112 rows where `نظام` *is* the term
  sit anywhere from rank 28 to 6,298. Consequences: never `LIMIT` in SQL before
  grouping (pagination is applied after aggregation), and the DB won't rank a
  variant below the query as typed — that ordering comes from
  `query_match_rank` (as typed > variant > no match).

**What the index does and doesn't fold.**
- No stemming at all: `"telescopes"` → 0 rows, `"telescope"` → 57; `"analyses"`
  4 vs `"analysis"` 998; `"réseaux"` 69 vs `"réseau"` 997; `"e-mails"` 1 vs
  `"e-mail"` 101. This was the biggest gap and is what step 1 fixes.
- British/American are separate tokens: `"colour centre"` 0 vs `"color
  center"` 2; `"oxidised"` 0 vs `"oxidized"` 7; `"haemoglobin"` 7 vs
  `"hemoglobin"` 78; `"catalogue"` 28 / `"catalog"` 21; `"sulphur"` 30 /
  `"sulfur"` 76. Both spellings are well represented, so both directions matter.
- Collation `utf8mb4_unicode_520_ci` folds accents, ligatures and case:
  `"reseau"` = `"réseau"` (997), `"oeil"` = `"œil"` (218), `"coeur"` =
  `"cœur"`. French elision is folded by the tokenizer: `"l'ordinateur"` =
  `"ordinateur"` (179). None of these need code.
- Arabic, verified *not* folded: `ال` (`"مكتبة"` 118 vs `"المكتبة"` 41 — the
  latter only matches rows containing the prefixed form), `ة/ه` (`"مكتبه"` 1
  unrelated row), `ى/ي` (`"مستشفى"` 145 vs `"مستشفي"` 0). Diacritics and
  hamza-on-alif are folded by the collation as expected.
- `"pH"` → 0 rows: tokens < 3 chars are dropped (`innodb_ft_min_token_size`,
  not changeable on ToolsDB). Still open; the autocomplete B-tree below is the
  planned answer.

**Cost.**
- Expansion widens result sets, and response size is what users wait for
  (server work ≈ 0.1–0.25 s up to 3k rows; a 7 s `system` search was ~all
  transfer). Pagination makes that affordable for clients that pass `limit`;
  the gadget does since PR #93.
- Arabic function words are not stopwords. InnoDB's default list is
  English-only: `على` matches 35,233 rows, `إلى` 21,932, `التي` 14,589, `des`
  8,521. Quoted (phrase) queries are unaffected, which is another reason the
  expansion keeps phrases. If the Arabic branch ever needs unquoted
  multi-token queries: build the fulltext index with an Arabic (+ French)
  stopword table via the session-scoped `innodb_ft_user_stopword_table`, set
  before the index is created in `deploy-db` (unverified on ToolsDB), or drop
  those tokens in `expand_query`.
- Rows without an English value (83, tracked in arabterm's
  `validation_baseline.json`) are ignored by `aggregate_terms`.

**simplemma, measured (2.0.0) and not adopted.** Lemma quality is good for
plurals (telescopes, matrices, radii, phenomena, réseaux→réseau, yeux→œil;
misses: lenses→lense, axes→axe only, statistics→statistic, better→good) but
RSS grows by +24 MB for English, +26 MB for French, +29 MB for Arabic per
process (0.2–0.3 s to load each), and the `Procfile` runs 4 gunicorn workers →
+200 MB for en+fr on a service with no explicit `--mem`. Queries are noun
phrases, so suffix rules with a ~45-entry irregular table cover the need with
no data files. simplemma stays the upgrade path if the rules prove
insufficient (lazy-load per language, raise `--mem`, or `--preload` to share
pages across workers). Its Arabic lemmatizer is also usable for step 3
(مكتبات→مكتبة, أنظمة→نظام, شروط→شرط; but كتب and مقرابات unchanged).

## What the DB already gives us

- Fulltext index: InnoDB, `(arabic, english, french, description)`,
  `NATURAL LANGUAGE MODE`. No stemming, tokens < 3 chars are dropped, default
  (English) stopwords. Quoted phrases are honoured and several of them OR.
- Collation `utf8mb4_unicode_520_ci`: case-, accent- and ligature-insensitive
  (verified above). Remaining Arabic gaps at this layer: `ال`, `ة`≠`ه`, `ى`≠`ي`.
- `Procfile` runs 4 gunicorn workers → anything held in Python memory is ×4.
  Prefer DB-side indexes over in-process tries or lexicons.

## Architecture (as implemented in step 1)

`expand_query(q) -> tuple[str, ...]` returns the bare query as typed, then up
to 7 variants, fewest changed tokens first. Per Latin-script token the
candidates are: the token, its hyphen-free form (`e-mail` → `email`), its
singulars (rules + `IRREGULAR_PLURALS`), and the other-side spellings
(`SPELLING_RULES`) of each of those; the phrase variants are the product of
the per-token candidates, capped. Arabic tokens, digits and queries carrying
their own `"` are passed through untouched.

`fulltext_query(q)` is what reaches `MATCH … AGAINST`: unchanged when there
is nothing to add; `"v1" "v2" …` when the client quoted the query (phrase
semantics kept); the deduplicated bag of tokens otherwise (already an OR).

Principles that keep it simple and safe:
- **Variants are added, never substituted.** A wrong guess (`axes` → `axe`,
  `ax`, `axis`; `wiki` → `wikus`) costs one lookup of a phrase that matches
  nothing. Where a suffix is ambiguous every reading is emitted and the
  database decides.
- **The query as typed always wins.** `query_match_rank` gives an exact match
  on the typed query rank 2, on a variant rank 1; groups sort on the max.
  Suggestion votes (`suggestion_score`) accept variant matches too, so
  `"telescopes"` gets the same suggested translation as `"telescope"`.
- Rules stay lists of plain regexes/pairs in `app.py`; no external data, no
  boolean mode, no wildcards. Noise variants for common words (`chemical` →
  `chaemical`, `series` → `sery`) are accepted rather than adding lookups.

Known gaps of the rules, by design: no pluralisation (a singular query does
not fetch plural-only entries — dictionaries list singular headwords), no verb
forms, `-ves` and `-ices` only through the table, the reverse `e` → `ae/oe`
only for the listed stems.

## Tools per feature

| Feature | Tool | Status / notes |
|---|---|---|
| Singularisation (en, fr) | suffix rules + `IRREGULAR_PLURALS` in `app.py` | **Done.** simplemma measured and parked (see Findings). |
| British/American | `SPELLING_PAIRS` (substrings) + `SPELLING_RULES` (regex families: `-ise/-ize`, `-our/-or`, `-re/-er`, `-ll-`, `-ogue`, `-amme`, `-ence/-ense`, `ae/oe`) | **Done.** Stems are listed where the suffix alone is ambiguous (`motor`, `science`). |
| Hyphen/joined | hyphen-free candidate per token | **Done** (`e-mail` → `email`; `e mail` is unnecessary, the tokenizer splits on `-`). |
| Autocomplete | B-tree prefix indexes + `LIKE 'prefix%'` | Open. `ALTER TABLE term ADD INDEX (english(40)), ADD INDEX (french(40)), ADD INDEX (arabic(40))` — in arabterm's schema or in `make fix_dump`. Collation gives case/accent insensitivity for free. New endpoint `/api/v1/suggest?q=`, frontend dropdown. Also solves the < 3-char problem (`pH`, `AI`) since exact/prefix hits come from the B-tree, not fulltext. |
| Did-you-mean (zero results only) | `rapidfuzz` over a pruned candidate set | Open. Candidates via `LIKE 'c%'` (same first letter) with `LENGTH` ±2 → a few thousand rows; score with `fuzz.WRatio`; show top 3 above 85. Avoids holding 500k strings ×4 workers. |

Deliberately skipped: Snowball stemmers (stems like `studi` aren't real tokens
→ would need `studi*` in boolean mode, whose ranking is worse), `inflect`
(English-only, a dependency for what 40 lines of rules do), spaCy (too heavy
for a Toolforge build), simplemma (memory, see Findings).

## Per language

**English — done.** Singulars, British/American, hyphens, and the
`query_match_rank` / suggestion fix. Watch production logs (`fulltext=` in the
`search_aggregated` log line) for rules worth adding to `SPELLING_PAIRS` or
`IRREGULAR_PLURALS`.

**French — done, mostly free.** Accents, `œ` and elision are folded by the
DB. The `-s` rule covers most plurals; `-x`, `-aux` → `-au`/`-al` are handled.
`normalise_french` already strips `(m.)`/`(f.)` for exact matching.

**Arabic — medium, separate branch** (fires only on Arabic-script tokens;
the expansion currently passes them through). Verified gaps, in order of value:
- `ال` prefix: fulltext tokens include it, so `مكتبة` misses `المكتبة` and
  vice versa. Add the other form as a variant phrase. (`normalise_arabic`
  strips it only for the Python exact-match step, not for the DB query.)
- `ة/ه` and `ى/ي` final-letter variants: two rules, same variant mechanism.
- Plurals/inflection (`مكتبات`→`مكتبة`, broken plurals `كتب`→`كتاب`): a `ات`
  → `ة` rule gets the sound feminine plural; broken plurals need a lexicon —
  **`farahidi`** (own tool, pure Python, pip) or simplemma's Arabic data
  (+29 MB RSS per worker, measured). Measure before adopting either; lazy-load
  on the first Arabic query and consider 2 workers × threads.
- Multi-word Arabic phrases: keep them quoted (the stopword issue above).

## Suggested order

1. ~~English + French: rules + the `query_match_rank` fix.~~ Done 2026-09-21.
2. Autocomplete (needs the index change coordinated with arabterm); also the
   answer to `pH`/`AI`.
3. Arabic branch: `ال` + final-letter variants first (no lexicon needed), then
   plurals.
4. Did-you-mean, only if zero-result queries remain common after 1–3.
