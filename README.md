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

### Database: MariaDB

Ingesting data:
- with a script, reading from SQLite database arabterm.db from https://github.com/forzagreen/arabterm
- adapted some types (string vs char vs text)


Creating indexes for Full Text Search:

```sql
CREATE FULLTEXT INDEX idx_english ON entry (english);
CREATE FULLTEXT INDEX idx_arabic ON entry (arabic);
CREATE FULLTEXT INDEX idx_french ON entry (french);
CREATE FULLTEXT INDEX idx_german ON entry (german);
CREATE FULLTEXT INDEX idx_description ON entry (description);
```

