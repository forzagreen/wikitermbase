# wikitermbase

## Table of Contents

- [Overview](#overview)
- [Wiki Gadget](#wiki-gadget)
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

The Wikipedia gadget frontend is built with [OOUI](https://www.mediawiki.org/wiki/OOUI) and can be enabled in Arabic Wikipedia's user preferences.


## Wiki Gadget

The Wikipedia [gadget](https://en.wikipedia.org/wiki/Wikipedia:Gadget) can be activated in [user preferences](https://ar.wikipedia.org/wiki/خاص:تفضيلات#mw-prefsection-gadgets) -> "مسرد الويكي".

The deployed version in Arabic Wikipedia:
- Gadget definition: [gadget-WikiTerm](https://ar.wikipedia.org/wiki/خاص:إضافات#gadget-WikiTerm)
- Gadget Javascript code: [Gadget-WikiTerm.js](https://ar.wikipedia.org/wiki/ميدياويكي:Gadget-WikiTerm.js)
- Gadget CSS code: [Gadget-WikiTerm.css](https://ar.wikipedia.org/wiki/ميدياويكي:Gadget-WikiTerm.css)

On Wikipedia, gadgets are production-ready features, while user scripts serve as a flexible environment for development and experimentation.

The [user script](https://en.wikipedia.org/wiki/Wikipedia:User_scripts), available at [gadget/SearchTerm.js](gadget/SearchTerm.js), differs from gadget code in that it consolidates all imports, JavaScript code, and CSS styles into a single file.


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

After pushing changes to `main` on GitHub (including any frontend rebuild — `make build_frontend && git add backend/frontend/dist && git commit`):

```sh
ssh toolforge && become wikitermbase
toolforge build start https://github.com/forzagreen/wikitermbase
toolforge build show   # wait until status is ok(Succeeded)
toolforge webservice buildservice restart
```

The Python buildpack auto-detects `uv.lock` and installs deps with `uv sync`, so committing changes to `pyproject.toml` + `uv.lock` is all that's needed when adding dependencies.

Verify the gadget on Arabic Wikipedia still works after each deploy.


## Database: MariaDB

### Updating data

Ref: https://mariadb.com/kb/en/backup-and-restore-overview/

Prerequisite: SQLite arabterm.db is up to date in [arabterm](https://github.com/forzagreen/arabterm) repository (`main` branch).

From [arabterm](https://github.com/forzagreen/arabterm) repository, generate MariaDB database:

```sh
make init_mariadb  # start or create container
make delete_mariadb
make migrate_to_mariadb

# Make sure search works in MariaDB:
make search_mariadb term="telescope"

# Generate database dumps, SQLite and MariaDB:
make dump
```

Commit and push `arabterm.db` and `db/` to arabterm GitHub repository:

Then, from [wikitermbase](https://github.com/forzagreen/wikitermbase) repository:

```sh
# If python dependencies changed (including arabterm python package):
pip uninstall arabterm
make init

# Download dump from arabterm repository, branch main
make download_dump
make fix_dump
```

Commit changes to git. Then go to ToolForge and update the database.


### MariaDB on Toolforge

#### Initial Setup

Ref: https://wikitech.wikimedia.org/wiki/Help:Toolforge/Database#User_databases

- `ssh toolforge` and `become wikitermbase`
- Find out your user in `$HOME/replica.my.cnf`
- Create the database:
  - Open the SQL console: `sql tools`
  - Create the database: `MariaDB [(none)]> CREATE DATABASE s55953__arabterm;`

#### Updating the Database

To update/restore the database:

- `ssh toolforge` and `become wikitermbase`
- `cd wikitermbase` and `git pull origin main` (supply username and token)
- `cd ~/wikitermbase/db`
- `mariadb --defaults-file=$HOME/replica.my.cnf -h tools.db.svc.wikimedia.cloud s55953__arabterm < arabterm.sql`


#### Troubleshooting

All these issues are fixed by running `make fix_dump`
  - https://jira.mariadb.org/browse/MDEV-34183 drop the line `/*!999999\- enable the sandbox mode */` or `/*M!999999\- enable the sandbox mode */`
  - `ERROR 1273 (HY000) at line 25: Unknown collation: 'utf8mb4_uca1400_ai_ci'`, replace it with `utf8mb4_unicode_520_ci`

## References

- Project description at Wikipedia: [مسرد الويكي](https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي)
- Database from [forzagreen/arabterm](https://github.com/forzagreen/arabterm)
- [ويكيبيديا:مصادر موثوقة/معاجم وقواميس وأطالس](https://ar.wikipedia.org/wiki/%D9%88%D9%8A%D9%83%D9%8A%D8%A8%D9%8A%D8%AF%D9%8A%D8%A7:%D9%85%D8%B5%D8%A7%D8%AF%D8%B1_%D9%85%D9%88%D8%AB%D9%88%D9%82%D8%A9/%D9%85%D8%B9%D8%A7%D8%AC%D9%85_%D9%88%D9%82%D9%88%D8%A7%D9%85%D9%8A%D8%B3_%D9%88%D8%A3%D8%B7%D8%A7%D9%84%D8%B3)
- Java client for the API: [wiki-connect/WikiTermBaseAPI](https://github.com/wiki-connect/WikiTermBaseAPI)
 
