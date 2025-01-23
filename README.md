# wikitermbase

## Table of Contents

- [Wiki Gadget](#wiki-gadget)
- [Backend](#backend)
  - [Flask API](#flask-api)
  - [Flask API on Toolforge](#flask-api-on-toolforge)
    - [Initial Setup](#initial-setup)
    - [Updating the Codebase](#updating-the-codebase)
- [Database: MariaDB](#database-mariadb)
  - [Ingesting data](#ingesting-data)
  - [Backup the database](#backup-the-database)
  - [MariaDB on Toolforge](#mariadb-on-toolforge)
    - [Initial Setup](#initial-setup-1)
    - [Updating the Database](#updating-the-database)
    - [Troubleshooting](#troubleshooting)

## Wiki Gadget

The frontend in Wikipedia is a mediawiki gadget [SearchTerm.js](SearchTerm.js)

Deployed at: 
- Latest: https://ar.wikipedia.org/wiki/مستخدم:ForzaGreen/SearchTerm.js
- version URL: https://ar.wikipedia.org/w/index.php?title=مستخدم:ForzaGreen/SearchTerm.js&oldid=67150710
- Dev: https://ar.wikipedia.org/wiki/مستخدم:ForzaGreen/SearchTerm-dev.js


## Backend

Python version: 3.11

### Flask API

Examples of queries:

```
GET /search?q=حرارة
GET /search?q=magnetoscope
```

As a result, we get a JSON:

```json
{
  "number_results": 2,
  "q": "magnetoscope",
  "results": [
    {
      "arabic": "مُسجِّلة فيديو",
      "dictionary_id": 780,
      "dictionary_name_arabic": "الإعلام والتواصل",
      "english": "video casette recorder (V.C.R.)",
      "french": "enregistreur vidéocassette; magnétoscope",
      "id": 204093,
      "relevance": 23.4629344940186,
      "uri": "http://arabterm.org/index.php?tx_3m5techdict_pi1[id]=204093"
    },
    {
      "arabic": "مُسجِّلة فيديو",
      "dictionary_id": 780,
      "dictionary_name_arabic": "الإعلام والتواصل",
      "english": "videotape recorder (V.T.R.)",
      "french": "magnétoscope",
      "id": 204126,
      "relevance": 23.4629344940186,
      "uri": "http://arabterm.org/index.php?tx_3m5techdict_pi1[id]=204126"
    }
  ]
}
```


### Flask API on Toolforge

#### Initial Setup

Refs:
- https://wikitech.wikimedia.org/wiki/Help:Toolforge/My_first_Flask_OAuth_tool
- https://wikitech.wikimedia.org/wiki/Help:Toolforge/Python
- https://wikitech.wikimedia.org/wiki/Help:Toolforge/Web/Python

For the initial setup of the repository in Toolforge:
- `ssh toolforge` and `become wikitermbase`
- Generate a token in Github
- Clone the repository `git clone https://github.com/forzagreen/wikitermbase`
- Enter webservice shell: `toolforge webservice --backend=kubernetes python3.11 shell`
- `mkdir -p $HOME/www/python`
- Create a symlink from `$HOME/www/python/src` to the folder `backend` of the cloned repo:
  - `ln -s /data/project/wikitermbase/wikitermbase/backend /data/project/wikitermbase/www/python/src`
- Create a virtual environment, activate it, and install dependencies:
  - `python3 -m venv $HOME/www/python/venv`
  - `source $HOME/www/python/venv/bin/activate`
  - `pip install -r $HOME/www/python/src/requirements.txt`
- Download Sina Tools models:
  - `download_files`
- Exit out of webservice shell (Ctrl + D or `exit`)
- `toolforge webservice --backend=kubernetes python3.11 start`
- To test, go to: `https://wikitermbase.toolforge.org/search?q=telescope`
- Check logs in `/data/project/wikitermbase/uwsgi.log`

#### Updating the Codebase

- `ssh toolforge` and `become wikitermbase`
- `cd wikitermbase` and `git pull origin main` (supply username and token)
- If python code changed:
  - Enter webservice shell: `toolforge webservice --backend=kubernetes python3.11 shell`
  - Enter python virtual environment and update dependencies:
    ```sh
    source $HOME/www/python/venv/bin/activate
    pip uninstall arabterm
    pip install -r $HOME/www/python/src/requirements.txt
    ```
  - Exit the webservice shell (`exit`)
- If npm dependencies changed, or to rebuild javascript/html/css code:
  - Enter Node.js shell: `toolforge webservice node18 shell`
  - `cd wikitermbase`, `make build_frontend`, and exit the shell.
- `toolforge webservice --backend=kubernetes python3.11 restart`
- To test, go to: `https://wikitermbase.toolforge.org/search?q=telescope`
- Make sure the gadget in Wikipedia is still working.


## Database: MariaDB

### Ingesting data
- with a script, reading from SQLite database arabterm.db from https://github.com/forzagreen/arabterm
- adapted some types (string vs char vs text)


### Updating data

Ref: https://mariadb.com/kb/en/backup-and-restore-overview/

Prerequisite: SQLite arabterm.db is up to date in arabterm repository.

From [arabterm](https://github.com/forzagreen/arabterm) repository, generate MariaDB database:

```sh
make init_mariadb  # start or create container
make delete_mariadb
make migrate_to_mariadb

# Make sure search works in MariaDB:
make search term="telescope"

# Generate database dumps, SQLite and MariaDB:
make dump
```

Commit and push `arabterm.db` and `db/` to arabterm GitHub repository:

Now, from [wikitermbase](https://github.com/forzagreen/wikitermbase) repository:

```sh
# If python dependencies changed (including arabterm python package):
pip uninstall arabterm
make init

# Download dump from arabterm repository, branch arabterm_v2
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

