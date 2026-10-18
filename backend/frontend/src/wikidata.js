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
// Case and mood marks, sukun, tanween, hamza marks, superscript alef:
// everything but the shadda, which distinguishes كَتَبَ from كَتَّبَ.
const NON_SHADDA_MARKS_RE = /[\u064B-\u0650\u0652-\u0655\u0670]/g;
const WASLA_RE = /\u0671/g;

// The key under which a verb from the arabic-morphology table and a Wikidata
// lemma meet: consonants plus shadda.
export const lemmaKey = (lemma) =>
  lemma.normalize('NFD').replace(WASLA_RE, 'ا').replace(NON_SHADDA_MARKS_RE, '').normalize('NFC');

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
// the one ar-senses created): the Map lists them all, the ones with Arabic
// glosses first.
const hasArabicGloss = (lexeme) => lexeme.senses.some((s) => s.gloss);
const sortLexemes = (lexemes) =>
  lexemes.sort(
    (a, b) => Number(hasArabicGloss(b)) - Number(hasArabicGloss(a)) || b.senses.length - a.senses.length
  );

// root -> Promise<Map<lemmaKey, [{ id, lemma, senses: [{ id, gloss, glossEn }] }]>>
export const fetchRootLexemes = (root) => {
  if (!cache.has(root)) {
    const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(buildQuery(root))}`;
    const promise = fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
      .then((r) => {
        if (!r.ok) throw new Error(`WDQS: HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const byId = new Map();
        for (const row of data.results.bindings) {
          const id = entityId(row.verb.value);
          if (!byId.has(id)) byId.set(id, { id, lemma: row.lemma.value, senses: [] });
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
        const byLemma = new Map();
        for (const lexeme of byId.values()) {
          const key = lemmaKey(lexeme.lemma);
          if (!byLemma.has(key)) byLemma.set(key, []);
          byLemma.get(key).push(lexeme);
        }
        byLemma.forEach(sortLexemes);
        return byLemma;
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
export const wikidataSenseUrl = (senseId) => {
  const [lexeme] = senseId.split('-');
  return `https://www.wikidata.org/wiki/Lexeme:${lexeme}#${senseId}`;
};
export const wiktionaryUrl = (lemma) =>
  `https://ar.wiktionary.org/wiki/${encodeURIComponent(lemma.normalize('NFD').replace(/[ً-ْٰ]/g, '').normalize('NFC'))}`;
export const arSensesSearchUrl = (root) =>
  `https://ar-senses.toolforge.org/lexemes?status=all&q=${encodeURIComponent(root.replace(HAMZA_RE, 'أ'))}`;
