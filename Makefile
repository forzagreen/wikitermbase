
init:
	pip install -r backend/requirements-dev.txt

format:
	ruff check --select I --fix backend
	ruff format backend

check:
	ruff check --select I --fix backend

test:
	pytest -vvv backend/tests

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
