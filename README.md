# wikitermbase

## Frontend

Frontend is a mediawiki gadget [SearchTerm.js](SearchTerm.js)

Deployed at: 
- Latest: https://ar.wikipedia.org/wiki/مستخدم:ForzaGreen/SearchTerm.js
- version URL: https://ar.wikipedia.org/w/index.php?title=مستخدم:ForzaGreen/SearchTerm.js&oldid=67150710


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
            "english": "video casette recorder (V.C.R.)",
            "french": "enregistreur vidéocassette; magnétoscope",
            "id": 204093,
            "relevance": 23.95148277282715
        },
        {
            "arabic": "مُسجِّلة فيديو",
            "english": "videotape recorder (V.T.R.)",
            "french": "magnétoscope",
            "id": 204126,
            "relevance": 23.95148277282715
        }
    ]
}
```

## Database: MariaDB

### Ingesting data:
- with a script, reading from SQLite database arabterm.db from https://github.com/forzagreen/arabterm
- adapted some types (string vs char vs text)

### Creating indexes for Full Text Search:

```sql
CREATE FULLTEXT INDEX idx_english ON entry (english);
CREATE FULLTEXT INDEX idx_arabic ON entry (arabic);
CREATE FULLTEXT INDEX idx_french ON entry (french);
CREATE FULLTEXT INDEX idx_german ON entry (german);
CREATE FULLTEXT INDEX idx_description ON entry (description);
```

### Backup the database:

- Ref: https://mariadb.com/kb/en/backup-and-restore-overview/
- Go inside the MariaDB Docker container, and run:

```sh
mariadb-dump --password=xxxx arabterm > /mnt/arabterm.sql
```

- Copy the generated file from the container:

```sh
docker cp mariadb:/mnt/arabterm.sql db/arabterm.sql
```

### MariaDB on Toolforge

- Ref: https://wikitech.wikimedia.org/wiki/Help:Toolforge/Database#User_databases
- `ssh toolforge` and `become wikitermbase`
- Find out your user in `$HOME/replica.my.cnf`
- Create the database:
  - Open the SQL console: `sql tools`
  - Create the database: `MariaDB [(none)]> CREATE DATABASE s55953__arabterm;`
- Restore from backup:
  - `cd ~/wikitermbase/db`
  - `mariadb --defaults-file=$HOME/replica.my.cnf -h tools.db.svc.wikimedia.cloud s55953__arabterm < arabterm.sql`
- Troubleshooting:
  - https://jira.mariadb.org/browse/MDEV-34183 drop the line `/*!999999\- enable the sandbox mode */`
  - `ERROR 1273 (HY000) at line 25: Unknown collation: 'utf8mb4_uca1400_ai_ci'`, replace it with `utf8mb4_unicode_520_ci`

```sh
mariadb db_name < backup-file.sql
```
