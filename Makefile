
init:
	pip install -r backend/requirements-dev.txt

format:
	ruff check --select I --fix backend
	ruff format backend
