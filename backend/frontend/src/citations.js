// src/citations.js
//
// Wikitext citing dictionary entries on Arabic Wikipedia: the same text the
// on-wiki gadget (gadget/Gadget-WikiTerm.js) generates.

// Module:ترقيم استشهادات numbers 20 citations and silently drops the rest.
export const MAX_GROUPED_CITATIONS = 20;

// A page is cited for every source but web glossaries («مسرد وب»): a
// dictionary entry with no page number asks for one with {{بلص}}, the short
// redirect to {{بحاجة لرقم الصفحة}} (the long name pushes the lines of a
// grouped citation past the popup's width).
const citedPage = (occurrence) => {
  if (occurrence.page) return occurrence.page;
  return occurrence.dictionary_dict_type === 'thesaurus' ? null : '{{بلص}}';
};

export const citationTemplate = (occurrence) => {
  const page = citedPage(occurrence);
  return page
    ? `{{استشهاد بويكي بيانات|${occurrence.dictionary_wikidata_id}|ص=${page}}}`
    : `{{استشهاد بويكي بيانات|${occurrence.dictionary_wikidata_id}}}`;
};

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
