// src/api.js
//
// The two metadata endpoints, fetched at most once per page load. Several
// components on the same page need the counts (the landing cards, the
// "what's new" panel, the dictionaries page), and /api/v1/dicts weighs
// 13 KB gzipped, so they share one request instead of each sending its own.
// A failed request is not cached, so the next caller tries again.

const cache = {};

const fetchOnce = (url, pick) => {
  if (!cache[url]) {
    cache[url] = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.json();
      })
      .then(pick)
      .catch((err) => {
        delete cache[url];
        throw err;
      });
  }
  return cache[url];
};

// { number_terms, number_dictionaries }
export const fetchStats = () => fetchOnce('/api/v1/stats', (data) => data);

// The dictionaries, most recently added first (descending id).
export const fetchDicts = () =>
  fetchOnce('/api/v1/dicts', (data) => (Array.isArray(data?.dictionaries) ? data.dictionaries : []));
