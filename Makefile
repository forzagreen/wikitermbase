
init:
	pip install -r backend/requirements-dev.txt

format:
	ruff check --select I --fix backend
	ruff format backend

build_frontend:
	cd backend/frontend && npm install && npm run build

download_dump:
	@echo "Downloading arabterm.sql..."
	@if command -v wget > /dev/null; then \
		wget -q https://github.com/forzagreen/arabterm/raw/refs/heads/feature/arabterm_v2/db/mariadb/arabterm.sql -O db/arabterm.sql; \
	else \
		curl -s https://github.com/forzagreen/arabterm/raw/refs/heads/feature/arabterm_v2/db/mariadb/arabterm.sql -o db/arabterm.sql; \
	fi
	@echo "Download complete: db/arabterm.sql"

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
