// src/citations.js
//
// Wikitext citing dictionary entries on Arabic Wikipedia: the same text the
// on-wiki gadget (gadget/Gadget-WikiTerm.js) generates.

// Module:ترقيم استشهادات numbers 20 citations and silently drops the rest.
export const MAX_GROUPED_CITATIONS = 20;

export const citationTemplate = (occurrence) =>
  occurrence.page
    ? `{{استشهاد بويكي بيانات|${occurrence.dictionary_wikidata_id}|ص=${occurrence.page}}}`
    : `{{استشهاد بويكي بيانات|${occurrence.dictionary_wikidata_id}}}`;

// The citable entries of a result group: one per dictionary and page, in the
// order they are listed (a dictionary can list a term twice on a page).
export const groupCitations = (occurrences) => {
  const seen = new Set();
  const citations = [];
  occurrences.forEach((occurrence) => {
    const template = citationTemplate(occurrence);
    if (occurrence.dictionary_wikidata_id && !seen.has(template)) {
      seen.add(template);
      citations.push({ occurrence, template });
    }
  });
  return citations;
};

// One {{ترقيم استشهادات}} reference numbering the given citations, in the
// style most articles use ([أ] [ب] [جـ] …). A single citation needs none.
export const groupedCitationTemplate = (templates) =>
  templates.length < 2
    ? templates.join('')
    : `{{ترقيم استشهادات|نمط=محرف عربي\n${templates.map((t, i) => `|م${i + 1}=${t}`).join('\n')}\n}}`;
