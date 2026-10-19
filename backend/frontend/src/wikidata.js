// src/wikidata.js
//
// The verbs of a root as Wikidata knows them: the lexemes linked to the root
// lexeme (P5920), each with its senses and their Arabic glosses. These are
// what the ar-senses tool reviews and publishes, so the morphology section
// reads them from Wikidata directly (the query service allows CORS), one
// SPARQL query per root, cached for the page's lifetime.
//
// Root lexemes spell their lemma with spaced letters ("ك ت ب") and a bare ء
// for every hamza seat, which is also farahidi's spelling; the أ variant is
// queried too, a few roots use it.

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const ARABIC = 'wd:Q13955';
const ROOT = 'wd:Q111029';
const VERB = 'wd:Q24905';

const HAMZA_RE = /[أإآؤئ]/g;
export const rootLemmaVariants = (root) => {
  const canonical = root.replace(HAMZA_RE, 'ء');
  const variants = new Set([canonical, canonical.replace(/ء/g, 'أ')]);
  return [...variants].map((r) => [...r].join(' '));
};

const buildQuery = (root) => {
  const values = rootLemmaVariants(root)
    .map((lemma) => `"${lemma}"@ar`)
    .join(' ');
  return `SELECT ?verb ?lemma ?sense ?gloss ?glossEn WHERE {
  VALUES ?rootLemma { ${values} }
  ?root dct:language ${ARABIC}; wikibase:lexicalCategory ${ROOT}; wikibase:lemma ?rootLemma .
  ?verb wdt:P5920 ?root; dct:language ${ARABIC}; wikibase:lexicalCategory ${VERB}; wikibase:lemma ?lemma .
  OPTIONAL {
    ?verb ontolex:sense ?sense .
    OPTIONAL { ?sense skos:definition ?gloss FILTER(LANG(?gloss) = "ar") }
    OPTIONAL { ?sense skos:definition ?glossEn FILTER(LANG(?glossEn) = "en") }
  }
}
ORDER BY ?lemma ?sense`;
};

const entityId = (uri) => uri.slice(uri.lastIndexOf('/') + 1);

const cache = new Map();

// One lemma can have several lexemes (an old entry with English glosses and
// the one ar-senses created): a key lists them all, the ones with Arabic
// glosses first.
export const hasArabicGloss = (lexeme) => lexeme.senses.some((s) => s.gloss);
const sortLexemes = (lexemes) =>
  lexemes.sort(
    (a, b) => Number(hasArabicGloss(b)) - Number(hasArabicGloss(a)) || b.senses.length - a.senses.length
  );

const fullKey = (lemma) => lemma.normalize('NFC');

const groupBy = (lexemes, keyOf) => {
  const map = new Map();
  for (const lexeme of lexemes) {
    const key = keyOf(lexeme.lemma);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(lexeme);
  }
  map.forEach(sortLexemes);
  return map;
};

// Lexemes by vowelled lemma: قَرَبَ, قَرِبَ and قَرُبَ are three verbs, and the
// table and ar-senses vowel a verb the same way (both follow mazini), so an
// exact match is the right one and a consonantal fallback would borrow
// another باب.
export const indexLexemes = (lexemes) => groupBy(lexemes, fullKey);

// The lexemes of a verb of the arabic-morphology table; [] when unpublished.
export const lexemesForVerb = (index, verb) => index?.get(fullKey(verb)) ?? [];

const WIKTIONARY_API = 'https://ar.wiktionary.org/w/api.php';

// Arabic Wiktionary keeps the tashkeel in its page names; which of these
// titles exist, in one request (the API takes 50 titles).
const fetchWiktionaryPages = async (titles) => {
  const existing = new Set();
  for (let i = 0; i < titles.length; i += 50) {
    const params = new URLSearchParams({
      action: 'query',
      titles: titles.slice(i, i + 50).join('|'),
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    const r = await fetch(`${WIKTIONARY_API}?${params}`);
    if (!r.ok) throw new Error(`Wiktionary: HTTP ${r.status}`);
    const data = await r.json();
    for (const page of data.query?.pages ?? []) {
      if (!page.missing) existing.add(fullKey(page.title));
    }
  }
  return existing;
};

// root -> Promise<Map<vowelled lemma, lexeme[]>>; each lexeme is
// { id, lemma, senses: [{ id, gloss, glossEn }], wiktionary: true | false | null }
// (null: Wiktionary could not be asked).
export const fetchRootLexemes = (root) => {
  if (!cache.has(root)) {
    const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(buildQuery(root))}`;
    const promise = fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
      .then((r) => {
        if (!r.ok) throw new Error(`WDQS: HTTP ${r.status}`);
        return r.json();
      })
      .then(async (data) => {
        const byId = new Map();
        for (const row of data.results.bindings) {
          const id = entityId(row.verb.value);
          if (!byId.has(id)) byId.set(id, { id, lemma: row.lemma.value, senses: [], wiktionary: null });
          const lexeme = byId.get(id);
          if (row.sense) {
            const senseId = entityId(row.sense.value);
            if (!lexeme.senses.some((s) => s.id === senseId)) {
              lexeme.senses.push({
                id: senseId,
                gloss: row.gloss?.value ?? null,
                glossEn: row.glossEn?.value ?? null,
              });
            }
          }
        }
        const lexemes = [...byId.values()];
        try {
          const existing = await fetchWiktionaryPages([...new Set(lexemes.map((l) => l.lemma))]);
          for (const lexeme of lexemes) lexeme.wiktionary = existing.has(fullKey(lexeme.lemma));
        } catch {
          /* the Wikidata part is still worth showing */
        }
        return indexLexemes(lexemes);
      })
      .catch((err) => {
        cache.delete(root);
        throw err;
      });
    cache.set(root, promise);
  }
  return cache.get(root);
};

export const wikidataLexemeUrl = (id) => `https://www.wikidata.org/wiki/Lexeme:${id}`;
// A sense's anchor on the lexeme page is its local part (L123-S2 → #S2).
export const wikidataSenseUrl = (senseId) => {
  const [lexeme, sense] = senseId.split('-');
  return `https://www.wikidata.org/wiki/Lexeme:${lexeme}#${sense}`;
};
// The page name keeps the tashkeel (كَتَبَ, not كتب).
export const wiktionaryUrl = (lemma) => `https://ar.wiktionary.org/wiki/${encodeURIComponent(fullKey(lemma))}`;
export const arSensesReviewUrl = (lexemeId) => `https://ar-senses.toolforge.org/review/${lexemeId}`;
export const arSensesSearchUrl = (root) =>
  `https://ar-senses.toolforge.org/lexemes?status=all&q=${encodeURIComponent(root.replace(HAMZA_RE, 'أ'))}`;
