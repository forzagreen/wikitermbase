# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wikitermbase is a terminology standardization tool for Arabic Wikipedia, providing multilingual dictionary lookup (Arabic/English/French). It's deployed on Wikimedia Toolforge at https://wikitermbase.toolforge.org.

## Common Commands

```bash
make init          # Install Python dependencies with uv
make run           # Start uvicorn (FastAPI) on port 5001
make test          # Run pytest tests
make format        # Format code with ruff
make check         # Lint check with ruff

# Frontend (React)
make build_frontend   # Build React app (cd backend/frontend && npm install && npm run build)
cd backend/frontend && npm run dev   # Start Vite dev server with hot reload

# Database (normally invoked by CI; useful for local debugging only)
make download_dump    # Download MariaDB dump from arabterm repo (db/arabterm.sql.gz)
make fix_dump         # Fix SQL dump compatibility issues, in the gzipped file
```

## Architecture

**Backend** ([backend/app.py](backend/app.py)): FastAPI app with SQLAlchemy connecting to MariaDB. Module exposes a single ASGI callable `app`. Deployed on Toolforge via the **Build Service** backend (`toolforge webservice buildservice`) — Cloud Native Buildpacks build the image from the GitHub repo, the [Procfile](Procfile) runs `gunicorn backend.app:app -k uvicorn.workers.UvicornWorker`. The legacy `python3.13` uWSGI webservice cannot run ASGI apps; see https://wikitech.wikimedia.org/wiki/Help:Toolforge/My_first_Python_ASGI_tool.
- `/api/v1/search?q=<term>` - Raw search results
- `/api/v1/search/aggregated?q=<term>` - Results grouped by normalized Arabic term. Optional `limit` (1–100) / `offset` page the groups; `number_groups` is always the total. **No `limit` returns every group** — keep it that way: on-wiki gadget copies that predate pagination send only `q`. Pagination is applied after grouping and is stateless (each page re-runs the query); don't move it into SQL, relevance ties are too massive (see [docs/ideas/search-robustness.md](docs/ideas/search-robustness.md)).
- Both search endpoints reject `q` longer than `MAX_QUERY_LENGTH` (256) with a 422: InnoDB answers phrases over 128 words with a 500 ("Too many words in a FTS phrase"), which pasted articles used to trigger. The gadget and the UI cap the typed text at 200 (the quotes they add must still fit).
- `/api/v1/dicts` - List all dictionaries, most recently added first (`ORDER BY id DESC`); the `/dictionaries` page shows them in that order
- `/api/v1/stats` - Database statistics
- `/api/v1/morphology?q=<arabic term>` - Per-word readings (root, وزن, features, clitics) from [farahidi](https://github.com/forzagreen/farahidi) plus the verbs of every proposed root from the bundled [arabic-morphology](https://github.com/M-Bakni/arabic-morphology) index ([backend/data/arabic_verbs.json.gz](backend/data/arabic_verbs.json.gz), rebuilt with `uv run python backend/build_verbs_index.py`). Logic in [backend/morphology.py](backend/morphology.py); no DB, no network.
- `/docs` and `/redoc` - Auto-generated OpenAPI docs

**Frontend**: React 19 app built with Vite in [backend/frontend/](backend/frontend/), served by FastAPI from `backend/frontend/dist/` (`/assets/*` mounted as `StaticFiles`; SPA shell served via `FileResponse` for known routes)
- Routes defined in [main.jsx](backend/frontend/src/main.jsx): `/`, `/ui/search/raw`, `/dictionaries`, `/tools` (ecosystem hub page; `mazini` npm package is lazy-imported there for the inline conjugation widget)
- **Important**: When adding new frontend routes, register them in both FastAPI ([app.py](backend/app.py)) and React Router ([main.jsx](backend/frontend/src/main.jsx))

**Wikipedia Gadget** ([gadget/](gadget/)): MediaWiki gadget for in-wiki term lookup. [Gadget-WikiTerm.js](gadget/Gadget-WikiTerm.js) + [Gadget-WikiTerm.css](gadget/Gadget-WikiTerm.css) are the files deployed to Arabic Wikipedia as `MediaWiki:Gadget-WikiTerm.js/.css`. The same JS file also runs as a user script (it waits for `mediawiki.util` itself), so there is no separate user-script copy; keep `mw.libs.wikiTerm` set synchronously, the selection gadget calls it right after loading the module. The gadget is designed for default enablement: only `mediawiki.util` at page load, OOUI lazy-loaded on first click, ES2015 syntax only (no `requiresES6`, it conflicts with `default`), no `console.*`. Entry point is a header icon on Vector 2022/Minerva and a `p-cactions` ("المزيد") item elsewhere.

**Database**: MariaDB with full-text search. Content managed in separate [arabterm](https://github.com/forzagreen/arabterm) repository. Local dev requires `./var/local.cnf` with database credentials:
```ini
[client]
user = MyUserName
password = MyTestPassword
```

## Deployment automation

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) classifies pushed paths via `dorny/paths-filter` and runs one of two SSH-based deploy jobs into the Toolforge bastion (as personal user `forzagreen`, then `become wikitermbase`):
- `deploy-code` runs on code changes: `toolforge build start` → poll `toolforge build show --json` for `status: ok` → `toolforge webservice buildservice restart`.
- `deploy-db` runs when `db/arabterm.sql.gz` changed: `git fetch origin main && git reset --hard origin/main` (the bastion checkout is only a deploy mirror; a plain pull failed once on a stray untracked `db/arabterm.sql.gz`) then `gunzip -c db/arabterm.sql.gz | mariadb ...`. The dump is committed gzipped because the unpacked file is over GitHub's limit of 100 MB per file.
- Markdown-only changes skip both deploys.
- `wikidata-stats` runs after `deploy-db` (and on "Run workflow"): [backend/wikidata_stats.py](backend/wikidata_stats.py) copies `/api/v1/stats` to Wikidata item [Q133800945](https://www.wikidata.org/wiki/Q133800945) as P4876 (number of records) = terms and P2670 (has part(s) of the class) = Q23622 dictionary + P1114 (quantity) = dictionaries. The two statements are overwritten in place, never appended (dumps refresh several times a week), and nothing is edited when the counts already match. [ويكيبيديا:مسرد الويكي](https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي) reads them with `{{#property:P4876}}` and `{{#invoke:WikidataIB|getQualifierValue|P2670|pval=Q23622|qual=P1114|...}}`, so don't change the properties without updating that page.

Data sync is cross-repo. When `db/mariadb/arabterm.sql.gz` changes on `forzagreen/arabterm` main, that repo's `notify-wikitermbase.yml` sends a `repository_dispatch` to this repo; [.github/workflows/refresh-dump.yml](.github/workflows/refresh-dump.yml) then runs `make download_dump && make fix_dump` and opens a PR via `peter-evans/create-pull-request`. The dispatch's `client_payload` carries `arabterm_sha`, `message` (the arabterm commit message) and `summary` (Markdown, the data changes computed by arabterm's `summarize_changes.py`); the `Describe the change` step turns them into the PR title (`chore: refresh DB dump — <commit subject>`) and body (which also counts the SQL lines added and removed, since a gzipped file has no diff on GitHub), rewriting `#N` to `forzagreen/arabterm#N` so that it does not link to an issue of this repo. A manual `workflow_dispatch` run has no payload: with a SHA it fetches the commit message from the GitHub API, and there is no data summary. Maintainer reviews and merges, which triggers `deploy-db`.

Required secrets: `TOOLFORGE_SSH_PRIVATE_KEY` (deploy ed25519 key registered on the maintainer's [toolsadmin](https://toolsadmin.wikimedia.org/profile/settings/ssh-keys/) profile — NOT in the bastion's `~/.ssh/authorized_keys`), `WIKITERMBASE_REFRESH_PAT` (fine-grained PAT scoped to this repo with Contents+PR write; the same value lives in arabterm as `WIKITERMBASE_DISPATCH_PAT` for the dispatch call), and `WIKIDATA_USERNAME` / `WIKIDATA_PASSWORD` (a wikidata.org [bot password](https://www.wikidata.org/wiki/Special:BotPasswords), username in `User@BotName` form, grant "Edit existing pages"; stored as secrets of the `wikidata` **environment**, not repo secrets, because only `main` may use that environment while `ci.yml` runs on pushes to every branch). Host (`login.toolforge.org`), username (`forzagreen`), and ECDSA host-key fingerprint (`SHA256:BOuOp0PJ...`) are inlined in the workflow since they're not secret.

CI script gotchas: `appleboy/ssh-action` wraps `appleboy/drone-ssh`, which (a) substitutes bare `$VAR` references in the script as if they were env vars (escape with `$$VAR` or wrap in a `bash << 'EOF'` heredoc), and (b) requires `request_pty: true` for `become` to work over non-interactive SSH (sudo/PAM needs a tty).

## Key Implementation Details

- Arabic text normalization in `normalise_arabic()` removes diacritics, tatweel, AL prefix, and normalizes hamza
- Search uses MariaDB `MATCH...AGAINST` full-text search with natural language mode. Clients send `q="term"` (literal quotes = phrase search). `expand_query()` adds singular / hyphen-free / British-American variants of Latin-script queries and `fulltext_query()` sends them as extra quoted phrases (several quoted phrases OR in natural-language mode); `query_match_rank()` ranks a match on the typed query above one on a variant. Rationale and measurements: [docs/ideas/search-robustness.md](docs/ideas/search-robustness.md)
- Results aggregation groups terms by normalized Arabic, electing most common English/French translations. Rows without an English value are ignored by `aggregate_terms` (data errors tracked in arabterm's `validation_baseline.json`; they used to turn the whole search into a 500). The raw endpoint still returns them.
- The «الترجمة المقترحة» badge is elected by the API, not the UI: `aggregate_terms` sets `suggested: true` on at most one group and sorts it first. Each dictionary giving the query itself as a translation of the group's Arabic term votes once, weighted `6 - tier`; the leader needs `SUGGESTION_MIN_SCORE` (5) votes and `SUGGESTION_MARGIN` (1.5×) over the runner-up, so thin or contested queries ("Netscape", "bank", "gene") deliberately get no badge. Occurrence counts must not drive it: one dictionary listing a related phrase twice used to win. The gadget does not read the flag yet; it highlights the first card.
- The «الجديد» button in the site header ([WhatsNew.jsx](backend/frontend/src/components/WhatsNew.jsx)) tells returning visitors what is new, once: the panel opens by itself when there is unseen news and closing it marks the news seen, in `localStorage` (`whatsNew`: feature ids, largest dictionary id, dictionary count — nothing is sent anywhere). Dictionaries added since the last visit are detected from `/api/v1/dicts` (only fetched when `number_dictionaries` from `/api/v1/stats` moved, the list is 13 KB), so a DB import announces itself. Features are the hand-written `FEATURES` list in [whatsNew.js](backend/frontend/src/whatsNew.js): add an entry (stable `id`, date, plain Arabic for a non-technical reader, optional animation like [PageLinkDemo.jsx](backend/frontend/src/components/PageLinkDemo.jsx)) only for something a visitor of the site notices — never dependency or CI changes — and prune entries after a few months. A first visit records the state silently (everything is new to a first-time visitor).
- A term's printed `page` links to that page of the dictionary's archive.org scan: `search_terms_mariadb` joins arabterm's `dictionary.archive_org_url` / `page_offset` and `archive_page_url()` turns them into `page_url` (`<url>/page/n<page + page_offset - 1>/mode/1up`, the link the Cite Q module builds); the two columns themselves are dropped from each row. The UI, the raw search and the gadget show `ص. N` as a link when `page_url` is there. The query names those columns, so a DB import without them breaks search.
- «تجميع الاستشهادات» (a result group's header, in the gadget and on the site; same wikitext from [citations.js](backend/frontend/src/citations.js) and `groupCitations()` in the gadget) cites the group in one reference: `{{ترقيم استشهادات|نمط=محرف عربي` + `|م1={{استشهاد بويكي بيانات|Q…|ص=…}}`… — the style most arwiki articles already use — one citation per distinct (dictionary, page), with a checklist, all ticked at first. At most 20: [وحدة:ترقيم استشهادات](https://ar.wikipedia.org/wiki/وحدة:ترقيم_استشهادات) numbers 20 (`MAX_REFS`) and silently drops the rest, and basic terms (شبكة، خلية) go past that.
- A citation of an entry with no `page` gets `ص={{بلص}}` (short redirect to {{بحاجة لرقم الصفحة}}, which puts the article in a maintenance category), except for web glossaries (`dict_type: thesaurus`, «مسرد وب»: ALECSO, AGROVOC, Electropedia…), which have no pages. Same rule in `citationTemplate()` (site) and `createCitationTemplate()` (gadget). `{{بلص}}` rather than the long name because the long one pushes a grouped citation's lines past the site popup's width.
- «تحليل صرفي» ([MorphologySection.jsx](backend/frontend/src/components/MorphologySection.jsx)) is opt-in from the ⚙ settings panel ([SettingsPanel.jsx](backend/frontend/src/components/SettingsPanel.jsx), [settings.js](backend/frontend/src/settings.js): one `settings` JSON in `localStorage`; the theme toggle moved into that panel). Site only, not the gadget. Per group it analyzes the most common raw `arabic` of the occurrences (parentheses stripped), not `arabic_normalised`, which has lost its hamzas (إنتاجية → انتاجية, unanalyzable); the request fires when the group scrolls near the viewport. Readings mostly tie at score 0, so the backend ranks bare nominal readings first (`reading_sort_key`) and the UI lets the reader pick another; a vowelled word that farahidi cannot read (it rejects a vowel written after a shadda) is retried bare. Verbs of the root are grouped by form (كَتَبَ lists both its بابs); their senses come from Wikidata client-side ([wikidata.js](backend/frontend/src/wikidata.js): one SPARQL per root, verbs linked to the root lexeme via P5920, root lemmas are spaced letters with ء for every hamza seat — farahidi's spelling too, the arabic-morphology table writes أ), and mazini conjugates them in the browser. One lemma can have several lexemes on Wikidata (an old entry and the one ar-senses created), all are listed. ar-senses has no API; its published output *is* those lexemes.
- farahidi's lexicon is ~150 MB per process once loaded, so `morphology.warm()` runs at import and the Procfile passes `--preload`: the gunicorn master loads it once and the 4 workers share the pages (`gc.freeze()` keeps the collector from dirtying them). The Toolforge `service.template` was raised to `mem: 2Gi` for headroom (1Gi before, ~280 MiB used). Layer 2 of farahidi (`analyze_text`, in-context) is deliberately not used: +230 MB for a pick that rarely differs on single words.
- The UI and gadgets send `q="term"` with literal quotes, and InnoDB treats them as a **phrase search** even in natural-language mode; unquoted multi-word queries OR their tokens instead.
- Environment detection in `setup_db_engine()` and `setup_sentry()`: Toolforge is detected via the `TOOL_REPLICA_USER` env var (works on both legacy uWSGI webservice and Build Service — `$HOME` differs between the two but the env var is constant). DB credentials are read from `TOOL_REPLICA_USER` / `TOOL_REPLICA_PASSWORD`. GitHub Actions uses `HOME=/home/runner` and stub creds; localhost reads `./var/local.cnf`.
- The Build Service Python buildpack auto-detects `uv.lock` and runs `uv sync`. Don't add a `requirements.txt` — the buildpack errors out if both `uv.lock` and `requirements.txt` are present.
- Frontend `backend/frontend/dist/` is **committed to git** (intentionally — `.gitignore` line is commented out). After UI changes run `make build_frontend && git add backend/frontend/dist && git commit` before deploying.

## Testing

Tests are in [backend/tests/](backend/tests/). Run a single test with:
```bash
uv run pytest -vvv backend/tests/test_app.py::test_normalise_arabic
```

## Python/Node Requirements

- Python 3.13 with uv for dependency management
- Node.js for frontend build
- `arabterm` package is installed from git (database models come from there)
