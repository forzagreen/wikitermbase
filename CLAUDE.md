# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wikitermbase is a terminology standardization tool for Arabic Wikipedia, providing multilingual dictionary lookup (Arabic/English/French). It's deployed on Wikimedia Toolforge at https://wikitermbase.toolforge.org.

## Common Commands

```bash
make init          # Install Python dependencies with uv
make run           # Start Flask server on port 5001
make test          # Run pytest tests
make format        # Format code with ruff
make check         # Lint check with ruff

# Frontend (React)
make build_frontend   # Build React app (cd backend/frontend && npm install && npm run build)
cd backend/frontend && npm run dev   # Start Vite dev server with hot reload

# Database
make download_dump    # Download MariaDB dump from arabterm repo
make fix_dump         # Fix SQL dump compatibility issues
```

## Architecture

**Backend** ([backend/app.py](backend/app.py)): Flask API with SQLAlchemy connecting to MariaDB
- `/api/v1/search?q=<term>` - Raw search results
- `/api/v1/search/aggregated?q=<term>` - Results grouped by normalized Arabic term
- `/api/v1/dicts` - List all dictionaries
- `/api/v1/stats` - Database statistics

**Frontend**: React 19 app built with Vite in [backend/frontend/](backend/frontend/), served by Flask from `backend/frontend/dist/`
- Routes defined in [main.jsx](backend/frontend/src/main.jsx): `/`, `/ui/search/raw`, `/dictionaries`
- **Important**: When adding new frontend routes, register them in both Flask ([app.py](backend/app.py)) and React Router ([main.jsx](backend/frontend/src/main.jsx))

**Wikipedia Gadget** ([gadget/](gadget/)): OOUI-based MediaWiki gadget for in-wiki term lookup. [SearchTerm.js](gadget/SearchTerm.js) is the main file; deployed to Arabic Wikipedia as Gadget-WikiTerm.js

**Database**: MariaDB with full-text search. Content managed in separate [arabterm](https://github.com/forzagreen/arabterm) repository. Local dev requires `./var/local.cnf` with database credentials:
```ini
[client]
user = MyUserName
password = MyTestPassword
```

## Key Implementation Details

- Arabic text normalization in `normalise_arabic()` removes diacritics, tatweel, AL prefix, and normalizes hamza
- Search uses MariaDB `MATCH...AGAINST` full-text search with natural language mode
- Results aggregation groups terms by normalized Arabic, electing most common English/French translations
- Environment detection: Toolforge (`/data/project/wikitermbase`), GitHub Actions (`/home/runner`), or localhost

## Testing

Tests are in [backend/tests/](backend/tests/). Run a single test with:
```bash
uv run pytest -vvv backend/tests/test_app.py::test_normalise_arabic
```

## Python/Node Requirements

- Python 3.11 with uv for dependency management
- Node.js for frontend build
- `arabterm` package is installed from git (database models come from there)
