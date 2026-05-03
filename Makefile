
init:
	uv sync --dev

init_prod:
	uv sync --active

# Regenerate requirements.txt from pyproject.toml — needed by Toolforge's
# Build Service Python buildpack (which uses pip, not uv).
requirements:
	uv export --no-dev --no-hashes --format requirements-txt -o requirements.txt

format:
	uv run ruff check --select I --fix backend
	uv run ruff format backend

check:
	uv run ruff check --select I --fix backend

test:
	uv run pytest -vvv backend/tests

run:
	uv run uvicorn backend.app:fastapi_app --reload --port 5001

build_frontend:
	cd backend/frontend && npm install && npm run build

download_dump:
	@echo "Downloading arabterm.sql.gz ..."
	@if command -v wget > /dev/null; then \
		wget -q https://github.com/forzagreen/arabterm/raw/refs/heads/main/db/mariadb/arabterm.sql.gz -O db/arabterm.sql.gz; \
	else \
		curl -s https://github.com/forzagreen/arabterm/raw/refs/heads/main/db/mariadb/arabterm.sql.gz -o db/arabterm.sql.gz; \
	fi
	@echo "Download complete: db/arabterm.sql.gz"
	gunzip --force db/arabterm.sql.gz
	@echo "Unzipping complete: db/arabterm.sql"

# Detect OS for sed compatibility
UNAME := $(shell uname)
ifeq ($(UNAME),Darwin)
	SED := sed -i ''
else
	SED := sed -i
endif

fix_dump:
	@echo "Fixing SQL dump..."
	@$(SED) \
		-e '/enable the sandbox mode/d' \
		-e 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_520_ci/g' \
		db/arabterm.sql
	@echo "SQL dump fixed: db/arabterm.sql"
