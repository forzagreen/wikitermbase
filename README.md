# wikitermbase

## Table of Contents

- [Overview](#overview)
- [Wiki Gadget](#wiki-gadget)
  - [Design Constraints and Architecture](#design-constraints-and-architecture)
  - [Selection Lookup Companion Gadget (`WikiTermSelection`)](#selection-lookup-companion-gadget-wikitermselection)
  - [Recommended Gadget Definitions](#recommended-gadget-definitions)
  - [Testing the Gadget](#testing-the-gadget)
- [Backend](#backend)
  - [API](#api)
  - [API on Toolforge](#api-on-toolforge)
    - [Initial Setup](#initial-setup)
    - [Updating the Codebase](#updating-the-codebase)
- [Database: MariaDB](#database-mariadb)
  - [Ingesting data](#ingesting-data)
  - [Updating data](#updating-data)
  - [MariaDB on Toolforge](#mariadb-on-toolforge)
    - [Initial Setup](#initial-setup-1)
    - [Updating the Database](#updating-the-database)
    - [Troubleshooting](#troubleshooting)


## Overview

Wiki Term Base is a tool designed to standardise terminology used on Arabic Wikipedia and accelerate vocabulary translation.

ℹ For functional documentation, please check the dedicated Wikipedia page [مسرد الويكي](https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي) (in Arabic).

🌐 The website is available at: [https://wikitermbase.toolforge.org](https://wikitermbase.toolforge.org/)

It is hosted on [Toolforge](https://wikitech.wikimedia.org/wiki/Help:Toolforge), as a [Python ASGI](https://wikitech.wikimedia.org/wiki/Help:Toolforge/My_first_Python_ASGI_tool) application built with the FastAPI framework (served by `gunicorn` with `uvicorn` workers via the Toolforge [Build Service](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Build_Service)), using a [MariaDB](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Database) relational database.

The website's frontend is built with [React](https://react.dev/) framework.

The Wikipedia gadget is built with [OOUI](https://www.mediawiki.org/wiki/OOUI) (loaded on demand) and can be enabled in Arabic Wikipedia's user preferences.


## Wiki Gadget

The Wikipedia [gadget](https://en.wikipedia.org/wiki/Wikipedia:Gadget) can be activated in [user preferences](https://ar.wikipedia.org/wiki/خاص:تفضيلات#mw-prefsection-gadgets) -> "مسرد الويكي".

The deployed version in Arabic Wikipedia:
- **WikiTerm** (primary lookup dialog):
  - Gadget definition: [gadget-WikiTerm](https://ar.wikipedia.org/wiki/خاص:إضافات#gadget-WikiTerm)
  - Gadget Javascript code: [Gadget-WikiTerm.js](https://ar.wikipedia.org/wiki/ميدياويكي:Gadget-WikiTerm.js)
  - Gadget CSS code: [Gadget-WikiTerm.css](https://ar.wikipedia.org/wiki/ميدياويكي:Gadget-WikiTerm.css)
- **WikiTermSelection** (companion shortcut lookup):
  - Gadget definition: [gadget-WikiTermSelection](https://ar.wikipedia.org/wiki/خاص:إضافات#gadget-WikiTermSelection)
  - Gadget Javascript code: [Gadget-WikiTermSelection.js](https://ar.wikipedia.org/wiki/ميدياويكي:Gadget-WikiTermSelection.js)

Files in [gadget/](gadget/):
- [Gadget-WikiTerm.js](gadget/Gadget-WikiTerm.js) and [Gadget-WikiTerm.css](gadget/Gadget-WikiTerm.css) are the main gadget, copied verbatim to the `MediaWiki:` pages above.
- [Gadget-WikiTermSelection.js](gadget/Gadget-WikiTermSelection.js) is the optional companion gadget that triggers term lookup directly from text selected in an editing surface using a keyboard shortcut (`Ctrl+Shift+K`).
- [SearchTerm.js](gadget/SearchTerm.js) is the [user script](https://en.wikipedia.org/wiki/Wikipedia:User_scripts) variant used for development: the same body as the gadget wrapped in `mw.loader.using( [ 'mediawiki.util' ] )` (only the wrapper lines differ). Run `npm run sync` after editing the gadget so both stay in sync.
- [tests/sync.js](gadget/tests/sync.js) synchronizes `SearchTerm.js` automatically by extracting the gadget body from `Gadget-WikiTerm.js`.

### Design Constraints and Architecture

The primary gadget is meant to be enabled by default (see the [default-gadget criteria](https://ar.wikipedia.org/wiki/ويكيبيديا:إضافات#معايير)):
- **Lazy loading**: The only page-load dependency is `mediawiki.util`. OOUI (about 90 KB gzipped) and the dialog are loaded on the first click via `mw.loader.using()`; no request reaches the WikiTermBase API until the user submits a search.
- **Entry points**: An icon button in the header on Vector 2022 (and its sticky header), on Minerva and in the Content Translation tool (`Special:ContentTranslation` has its own skin); an item in the page-actions menu ("المزيد") on Vector legacy, MonoBook, Timeless and any other skin, via `mw.util.addPortletLink()`. Users of those skins who prefer the top personal toolbar can set `window.wikiTermConfig = { placement: 'personal' };` in their `common.js`.
- **Public API & pre-filling**: `Gadget-WikiTerm.js` exposes `mw.libs.wikiTerm = { openDialog: openDialog }`. Companion gadgets and user scripts can call `mw.libs.wikiTerm.openDialog(prefillText)` with an optional search term to open the dialog, pre-fill the search input, automatically trigger the search query, and select the search input text.
- **Syntax and standards**: Only ES2015 syntax (MediaWiki's Grade A baseline is ES2019, and `requiresES6` cannot be combined with `default`). No `console.*` calls.
- **Batched pagination**: Results are fetched 30 groups at a time (`limit` / `offset` on `/api/v1/search/aggregated`); "show more" requests the next window. Broad terms have thousands of groups and multi-megabyte full responses. A new request aborts the one in flight.

### Selection Lookup Companion Gadget (`WikiTermSelection`)

[Gadget-WikiTermSelection.js](gadget/Gadget-WikiTermSelection.js) enables an editor to highlight a word or phrase with the mouse in an editing surface, then press a keyboard shortcut to open the WikiTerm lookup dialog pre-filled with the selection — without leaving the editor or re-typing the term.

- **Supported editing surfaces**:
  - 2010 wikitext source editor (`#wpTextbox1`)
  - WikiEditor / CodeMirror (`.cm-editor .cm-content`)
  - VisualEditor surface (`.ve-ce-documentNode`)
  - Content Translation segments (`.cx-segment`)
- **Two-phase trigger sequence**:
  1. `mouseup`: The user completes a mouse selection inside an allowed editing surface. This only *arms* the shortcut and checks `!selection.isCollapsed` — it does not read the selected text.
  2. `keydown` (`Ctrl + Alt + W`): Fired while still focused in the surface. Only then is the selection text read and passed to `mw.libs.wikiTerm.openDialog(text)`.
- **Scope & privacy**: Outside allowed editing surfaces, listeners bail out immediately without touching `window.getSelection()`. Starting a new mouse gesture (`mousedown`) disarms the shortcut until a fresh `mouseup` re-arms it, ensuring stale selections are never reused.

### Recommended Gadget Definitions

On `[[MediaWiki:Gadgets-definition]]`:

```
* WikiTerm [default |rights=minoredit |supportsUrlLoad |dependencies=mediawiki.util] |WikiTerm.js |WikiTerm.css
* WikiTermSelection [dependencies=ext.gadget.WikiTerm] |WikiTermSelection.js
```

### Testing the Gadget

Tooling lives in [gadget/package.json](gadget/package.json) (ESLint with the Wikimedia config, Playwright for a browser matrix):

```sh
cd gadget && npm install
npm run sync                              # synchronize SearchTerm.js body from Gadget-WikiTerm.js
npm run lint                              # eslint-config-wikimedia: client/es6 + mediawiki + jquery
npm run check                             # verify sync, enforce gzipped size budget, check for forbidden calls
npx playwright install firefox webkit     # once; Chrome uses the installed Google Chrome
npm run matrix                            # Chrome/Firefox/WebKit × Vector 2022 (light+night)/Vector 2010/MonoBook/Timeless/Minerva/Content Translation
npm run summary                           # Markdown table from tests/out/matrix_results.json (screenshots in tests/out/shots/)
BROWSERS=chrome SKINS=vector npm run matrix   # subset
```

The matrix opens a real ar.wikipedia article (logged out), injects the working-tree gadget, and drives it end to end: entry point → dialog (lazy OOUI load, bytes and time recorded) → search → expand → citation copy → "show more" → close, failing on any uncaught JavaScript error. `npm run check` is network-free: it verifies `SearchTerm.js` is in sync with the gadget, enforces a gzipped size budget (10 KB JS, 3 KB CSS) and rejects `console.*` calls.

The same checks run in GitHub Actions ([gadget.yml](.github/workflows/gadget.yml)) on every pull request touching `gadget/`, on pushes to `main`, and weekly. The run's job summary shows the results table and the screenshots + JSON are attached as a downloadable artifact, so the numbers can be checked and re-run by anyone from the [Actions tab](https://github.com/forzagreen/wikitermbase/actions/workflows/gadget.yml).

To try the working-tree version on-wiki without deploying anything, disable the WikiTerm gadget in your preferences, open any page and paste in the browser console (replace `main` with your branch):

```js
const base = 'https://raw.githubusercontent.com/forzagreen/wikitermbase/main/gadget/';
fetch(base + 'Gadget-WikiTerm.css').then(r => r.text()).then(css => mw.util.addCSS(css));
fetch(base + 'Gadget-WikiTerm.js').then(r => r.text()).then(js => $.globalEval(js));

// To also test the selection shortcut companion gadget:
fetch(base + 'Gadget-WikiTermSelection.js').then(r => r.text()).then(js => $.globalEval(js));
```

Or install it as a user script: copy [gadget/SearchTerm.js](gadget/SearchTerm.js) to `User:You/SearchTerm.js`, the CSS to `User:You/SearchTerm.css`, and load both from your `common.js`.

Reproducible footprint checks anyone can run in the browser console on ar.wikipedia:
- `mw.loader.getState('oojs-ui-core')` — `registered` means OOUI is not loaded; the old definition makes it `ready` on every page, the new one only after the first click.
- `mw.loader.inspect()` — MediaWiki's own per-module size report; look for `ext.gadget.WikiTerm` and the `oojs-ui-*` rows.
- DevTools → Network, filter `load.php`: with the new gadget nothing is fetched from `wikitermbase.toolforge.org` until a search is submitted.

Once the gadget definition carries `supportsUrlLoad`, external tools can A/B the page-load impact on the same URL with and without `?withgadget=WikiTerm` (e.g. Lighthouse in Chrome DevTools, [PageSpeed Insights](https://pagespeed.web.dev/), [WebPageTest](https://www.webpagetest.org/)). Note `?withgadget=` only works for users the gadget is registered for, so a `rights=` restriction hides it from logged-out tools.


## Local Setup

Please note that the database content is managed in the project [arabterm](https://github.com/forzagreen/arabterm).

Clone the arabterm repository, and start the MariaDB database in a Docker container:

```sh
make init
make init_mariadb  # start or create container
make delete_mariadb  # delete database if exists
make migrate_to_mariadb  # migrate the SQLite content to MariaDB
```

Then from wikitermbase repository, install python dependencies (requires [uv](https://docs.astral.sh/uv/)):

```sh
make init
```

Create a file at `./var/local.cnf` with (adapt values):

```ini
[client]
user = MyUserName
password = MyTestPassword
```

Start the application:

```sh
make run
```

You can then open the web application at `http://127.0.0.1:5001/`


## Backend

Python version: 3.13

### API

Interactive OpenAPI docs (Swagger UI) are available at [/docs](https://wikitermbase.toolforge.org/docs) — and at `/redoc` for the ReDoc rendering. These are auto-generated from the FastAPI route signatures and let you try every endpoint from the browser.

- Aggregated search (results are groupped by the arabic term):

```
GET /api/v1/search/aggregated?q=magnetoscope
GET /api/v1/search/aggregated?q=اشتقاق
```

As a result, we get a JSON. An example can found at [gadget/response.json](gadget/response.json)

- Raw search (without groupping):

```
GET /api/v1/search?q=magnetoscope
GET /api/v1/search?q=اشتقاق
```


### API on Toolforge (Build Service)

ASGI applications cannot run on Toolforge's legacy `python3.13` uWSGI webservice — they require the **Build Service** backend, which uses Cloud Native Buildpacks to build a container image directly from the public GitHub repo and runs it according to the [Procfile](Procfile). Frontend assets (`backend/frontend/dist/`) are committed to git so the Python buildpack alone is sufficient — no Node.js step in the build pipeline.

Refs:
- https://wikitech.wikimedia.org/wiki/Help:Toolforge/My_first_Python_ASGI_tool
- https://wikitech.wikimedia.org/wiki/Help:Toolforge/Build_Service

#### Initial Setup

DB credentials don't need to be configured: Toolforge auto-injects `TOOL_REPLICA_USER` and `TOOL_REPLICA_PASSWORD` into Build Service containers (same as for the legacy uWSGI webservice). The app reads them directly from `os.environ`.

```sh
ssh toolforge
become wikitermbase

# Stop the legacy webservice if it was previously running on python3.13
toolforge webservice --backend=kubernetes python3.13 stop || true

# Build the image from the public GitHub repo
toolforge build start https://github.com/forzagreen/wikitermbase
toolforge build show   # wait until status is ok(Succeeded)

# Start the Build Service webservice
toolforge webservice buildservice start --mount=none
```

Test: `https://wikitermbase.toolforge.org/api/v1/stats`. Logs: `toolforge webservice buildservice logs -f`.

#### Updating the Codebase

Code deploys are automated. On push to `main`, the `deploy-code` job in [.github/workflows/ci.yml](.github/workflows/ci.yml) SSHs into the bastion and runs `toolforge build start` + `toolforge webservice buildservice restart`. Markdown-only and data-only changes skip the rebuild. Manual re-deploy: Actions tab → "CI" → "Run workflow" on `main`.

Include any frontend rebuild in the commit (`make build_frontend && git add backend/frontend/dist && git commit`). The Python buildpack auto-detects `uv.lock` and installs deps with `uv sync`, so committing changes to `pyproject.toml` + `uv.lock` is all that's needed when adding dependencies.

Verify the gadget on Arabic Wikipedia still works after each deploy.

Manual fallback (if GitHub Actions is down):

```sh
ssh toolforge && become wikitermbase
toolforge build start https://github.com/forzagreen/wikitermbase
toolforge build show   # wait until status is ok(Succeeded)
toolforge webservice buildservice restart
```


## Database: MariaDB

Data lives in [forzagreen/arabterm](https://github.com/forzagreen/arabterm) — that's the source of truth and where dictionary edits happen. When a PR touching `db/mariadb/arabterm.sql.gz` is merged to arabterm's `main`, the cross-repo CI flow auto-opens a PR here with the regenerated `db/arabterm.sql`; merging that PR triggers the production DB import (see "Updating the Database" below). For the upstream dump-generation workflow (`make init_mariadb`, `make migrate_to_mariadb`, `make dump`), see arabterm's README.

### MariaDB on Toolforge

#### Initial Setup

Ref: https://wikitech.wikimedia.org/wiki/Help:Toolforge/Database#User_databases

- `ssh toolforge` and `become wikitermbase`
- Find out your user in `$HOME/replica.my.cnf`
- Create the database:
  - Open the SQL console: `sql tools`
  - Create the database: `MariaDB [(none)]> CREATE DATABASE s55953__arabterm;`

#### Updating the Database

DB imports are automated. The flow is:

1. Update data in [forzagreen/arabterm](https://github.com/forzagreen/arabterm) and merge to `main`. When `db/mariadb/arabterm.sql.gz` changes, arabterm's `notify-wikitermbase.yml` dispatches an event to this repo.
2. wikitermbase's `refresh-dump.yml` runs `make download_dump && make fix_dump` and opens a PR titled `chore: refresh DB dump from arabterm@<sha>`.
3. Review the diff to `db/arabterm.sql` and merge. CI's `deploy-db` job SSHs into the bastion and runs `mariadb ... < db/arabterm.sql` automatically.

Manual triggers:
- **Re-run the dump regeneration:** Actions tab → "Refresh DB dump from arabterm" → "Run workflow".
- **Re-import without a code change:**

  ```sh
  ssh toolforge && become wikitermbase
  cd ~/wikitermbase
  mariadb --defaults-file=$HOME/replica.my.cnf -h tools.db.svc.wikimedia.cloud s55953__arabterm < db/arabterm.sql
  ```


#### Troubleshooting

All these issues are fixed by running `make fix_dump`
  - https://jira.mariadb.org/browse/MDEV-34183 drop the line `/*!999999\- enable the sandbox mode */` or `/*M!999999\- enable the sandbox mode */`
  - `ERROR 1273 (HY000) at line 25: Unknown collation: 'utf8mb4_uca1400_ai_ci'`, replace it with `utf8mb4_unicode_520_ci`

## References

- Project description at Wikipedia: [مسرد الويكي](https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي)
- Database from [forzagreen/arabterm](https://github.com/forzagreen/arabterm)
- [ويكيبيديا:مصادر موثوقة/معاجم وقواميس وأطالس](https://ar.wikipedia.org/wiki/%D9%88%D9%8A%D9%83%D9%8A%D8%A8%D9%8A%D8%AF%D9%8A%D8%A7:%D9%85%D8%B5%D8%A7%D8%AF%D8%B1_%D9%85%D9%88%D8%AB%D9%88%D9%82%D8%A9/%D9%85%D8%B9%D8%A7%D8%AC%D9%85_%D9%88%D9%82%D9%88%D8%A7%D9%85%D9%8A%D8%B3_%D9%88%D8%A3%D8%B7%D8%A7%D9%84%D8%B3)
- Java client for the API: [wiki-connect/WikiTermBaseAPI](https://github.com/wiki-connect/WikiTermBaseAPI)
 
