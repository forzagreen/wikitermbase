
init:
	uv sync --dev

init_prod:
	uv sync --active

format:
	uv run ruff check --select I --fix backend
	uv run ruff format backend

check:
	uv run ruff check --select I --fix backend

test:
	uv run pytest -vvv backend/tests

run:
	uv run uvicorn backend.app:app --reload --port 5001

# Copy /api/v1/stats to the Wikidata item (run by CI after DB imports).
# Preview without credentials: uv run python backend/wikidata_stats.py --dry-run
wikidata_stats:
	uv run python backend/wikidata_stats.py

build_frontend:
	cd backend/frontend && npm install && npm run build

# The dump is committed gzipped (db/arabterm.sql.gz): unpacked, it is over GitHub's limit of
# 100 MB per file. Import it with: gunzip -c db/arabterm.sql.gz | mariadb ...
download_dump:
	@echo "Downloading arabterm.sql.gz ..."
	@if command -v wget > /dev/null; then \
		wget -q https://github.com/forzagreen/arabterm/raw/refs/heads/main/db/mariadb/arabterm.sql.gz -O db/arabterm.sql.gz; \
	else \
		curl -sL https://github.com/forzagreen/arabterm/raw/refs/heads/main/db/mariadb/arabterm.sql.gz -o db/arabterm.sql.gz; \
	fi
	@gzip -t db/arabterm.sql.gz
	@echo "Download complete: db/arabterm.sql.gz"

# gzip -n leaves the name and the time out of the archive, so that an unchanged dump gives an
# unchanged file. gzip -t first: sh has no pipefail, a broken archive would otherwise pass.
fix_dump:
	@echo "Fixing SQL dump..."
	@gzip -t db/arabterm.sql.gz
	@gunzip -c db/arabterm.sql.gz \
		| sed \
			-e '/enable the sandbox mode/d' \
			-e 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_520_ci/g' \
		| gzip -n > db/arabterm.sql.gz.tmp
	@mv db/arabterm.sql.gz.tmp db/arabterm.sql.gz
	@echo "SQL dump fixed: db/arabterm.sql.gz"
