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
make download_dump    # Download MariaDB dump from arabterm repo
make fix_dump         # Fix SQL dump compatibility issues
```

## Architecture

**Backend** ([backend/app.py](backend/app.py)): FastAPI app with SQLAlchemy connecting to MariaDB. Module exposes a single ASGI callable `app`. Deployed on Toolforge via the **Build Service** backend (`toolforge webservice buildservice`) — Cloud Native Buildpacks build the image from the GitHub repo, the [Procfile](Procfile) runs `gunicorn backend.app:app -k uvicorn.workers.UvicornWorker`. The legacy `python3.13` uWSGI webservice cannot run ASGI apps; see https://wikitech.wikimedia.org/wiki/Help:Toolforge/My_first_Python_ASGI_tool.
- `/api/v1/search?q=<term>` - Raw search results
- `/api/v1/search/aggregated?q=<term>` - Results grouped by normalized Arabic term
- `/api/v1/dicts` - List all dictionaries
- `/api/v1/stats` - Database statistics
- `/docs` and `/redoc` - Auto-generated OpenAPI docs

**Frontend**: React 19 app built with Vite in [backend/frontend/](backend/frontend/), served by FastAPI from `backend/frontend/dist/` (`/assets/*` mounted as `StaticFiles`; SPA shell served via `FileResponse` for known routes)
- Routes defined in [main.jsx](backend/frontend/src/main.jsx): `/`, `/ui/search/raw`, `/dictionaries`
- **Important**: When adding new frontend routes, register them in both FastAPI ([app.py](backend/app.py)) and React Router ([main.jsx](backend/frontend/src/main.jsx))

**Wikipedia Gadget** ([gadget/](gadget/)): OOUI-based MediaWiki gadget for in-wiki term lookup. [SearchTerm.js](gadget/SearchTerm.js) is the main file; deployed to Arabic Wikipedia as Gadget-WikiTerm.js

**Database**: MariaDB with full-text search. Content managed in separate [arabterm](https://github.com/forzagreen/arabterm) repository. Local dev requires `./var/local.cnf` with database credentials:
```ini
[client]
user = MyUserName
password = MyTestPassword
```

## Deployment automation

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) classifies pushed paths via `dorny/paths-filter` and runs one of two SSH-based deploy jobs into the Toolforge bastion (as personal user `forzagreen`, then `become wikitermbase`):
- `deploy-code` runs on code changes: `toolforge build start` → poll `toolforge build show --json` for `status: ok` → `toolforge webservice buildservice restart`.
- `deploy-db` runs when `db/arabterm.sql` changed: `git pull --ff-only origin main` then `mariadb ... < db/arabterm.sql`.
- Markdown-only changes skip both deploys.

Data sync is cross-repo. When `db/mariadb/arabterm.sql.gz` changes on `forzagreen/arabterm` main, that repo's `notify-wikitermbase.yml` sends a `repository_dispatch` to this repo; [.github/workflows/refresh-dump.yml](.github/workflows/refresh-dump.yml) then runs `make download_dump && make fix_dump` and opens a PR via `peter-evans/create-pull-request`. Maintainer reviews and merges, which triggers `deploy-db`.

Required secrets: `TOOLFORGE_SSH_PRIVATE_KEY` (deploy ed25519 key registered on the maintainer's [toolsadmin](https://toolsadmin.wikimedia.org/profile/settings/ssh-keys/) profile — NOT in the bastion's `~/.ssh/authorized_keys`), and `WIKITERMBASE_REFRESH_PAT` (fine-grained PAT scoped to this repo with Contents+PR write; the same value lives in arabterm as `WIKITERMBASE_DISPATCH_PAT` for the dispatch call). Host (`login.toolforge.org`), username (`forzagreen`), and ECDSA host-key fingerprint (`SHA256:BOuOp0PJ...`) are inlined in the workflow since they're not secret.

CI script gotchas: `appleboy/ssh-action` wraps `appleboy/drone-ssh`, which (a) substitutes bare `$VAR` references in the script as if they were env vars (escape with `$$VAR` or wrap in a `bash << 'EOF'` heredoc), and (b) requires `request_pty: true` for `become` to work over non-interactive SSH (sudo/PAM needs a tty).

## Key Implementation Details

- Arabic text normalization in `normalise_arabic()` removes diacritics, tatweel, AL prefix, and normalizes hamza
- Search uses MariaDB `MATCH...AGAINST` full-text search with natural language mode
- Results aggregation groups terms by normalized Arabic, electing most common English/French translations
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
