// src/morphologyTerm.js
//
// Which text the «تحليل صرفي» section analyzes for a result group.
//
// The group's title (arabic_normalised) has lost its hamzas and diacritics,
// which the analyzer needs (إنتاجية is a word, انتاجية is not), so the text
// comes from the group's entries instead. An entry's `arabic` may pack
// several synonyms («مقارب كاسجرين، تلسكوب كاسجرين»; the API files such an
// entry under each of them), so it is split the way the API splits it and
// only the synonym whose normalisation is the group's title counts. The most
// common spelling among the entries wins; ties go to the first entry (the
// highest-ranked dictionary).

// Same separators as the API's split_translations (not the plain comma).
const SEPARATOR_RE = /[;/،؛]/;
const PARENS_RE = /\(.*?\)/g;

// JS twin of the API's normalise_arabic (app.py), so that a synonym can be
// matched to the group it was filed under. `\b` is ASCII-only in JS, hence
// the explicit start-or-space before ال.
export const normaliseArabic = (text) =>
  text
    .replace(/[ً-ْ]/g, '')
    .replace(/ـ/g, '')
    .replace(/(^|\s)ال/g, '$1')
    .replace(/[أإآ]/g, 'ا')
    .replace(PARENS_RE, '')
    .replace(/[^؀-ۿA-Za-z\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

// Parenthesised parts: a gloss or an elision mark («خلية (نباتية)»,
// «مدرسة (ال…) التقسيمية»), never analyzed.
const stripParentheses = (text) => text.replace(PARENS_RE, ' ').replace(/\s+/g, ' ').trim();

const candidates = (arabic) =>
  (arabic ?? '')
    .split(SEPARATOR_RE)
    .map(stripParentheses)
    .filter(Boolean);

export const termToAnalyze = (group) => {
  // Compared normalised on both sides: a group key is not always fully
  // normalised itself (the one above keeps its parentheses).
  const key = normaliseArabic(group.arabic_normalised);
  const counts = new Map();
  for (const occurrence of group.occurences ?? []) {
    for (const text of candidates(occurrence.arabic)) {
      if (normaliseArabic(text) === key) {
        counts.set(text, (counts.get(text) ?? 0) + 1);
      }
    }
  }
  let best = stripParentheses(group.arabic_normalised);
  let bestCount = 0;
  for (const [text, count] of counts) {
    if (count > bestCount) [best, bestCount] = [text, count];
  }
  return best;
};
