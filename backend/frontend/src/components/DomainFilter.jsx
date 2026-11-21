// src/components/DomainFilter.jsx
//
// «المجال»: narrows a list to the dictionaries of some domains. On the search
// page the pills are the domains in which the query has results, with the
// number of results in each (the API's `domains`, counted before the filter,
// so the other domains stay on offer); on the dictionaries page, every domain
// with its number of dictionaries. Several domains can be on at once: a
// dictionary of any of them qualifies. «الكل» takes the filter off.
//
// Only the largest domains show at first; the rest is behind «مجالات أخرى».
// A selected domain always shows, even with no result for the current query:
// otherwise there would be no way to take it off.
import { useEffect, useState } from 'react';
import { fetchDomains } from '../api';

const VISIBLE = 7;

const PILL =
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
const OFF =
  'border-gray-200 bg-white text-gray-700 hover:border-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500';
const ON = 'border-blue-600 bg-blue-600 text-white';

// facets: [{ name_tech, name_arabic, count }], the largest first.
const DomainFilter = ({ facets, selected, onChange, className = '' }) => {
  const [showAll, setShowAll] = useState(false);
  // Names of the domains the facets do not carry: a selected domain without
  // results. Only fetched in that case.
  const [names, setNames] = useState({});
  const missing = selected.filter((slug) => !facets.some((f) => f.name_tech === slug));
  const needsNames = missing.some((slug) => !names[slug]);
  useEffect(() => {
    if (!needsNames) return;
    fetchDomains()
      .then((domains) => setNames(Object.fromEntries(domains.map((d) => [d.name_tech, d.name_arabic]))))
      .catch(() => {});
  }, [needsNames]);

  if (facets.length === 0 && selected.length === 0) return null;

  const items = [
    ...facets,
    ...missing.map((slug) => ({ name_tech: slug, name_arabic: names[slug] ?? slug, count: 0 })),
  ];
  const visible = showAll
    ? items
    : items.filter((item, i) => i < VISIBLE || selected.includes(item.name_tech));
  const hiddenCount = items.length - visible.length;

  const toggle = (slug) =>
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);

  return (
    <div
      role="group"
      aria-label="حصر النتائج في مجال"
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      <span className="ml-1 text-sm font-semibold text-gray-600 dark:text-gray-300">المجال:</span>
      <button
        type="button"
        onClick={() => onChange([])}
        aria-pressed={selected.length === 0}
        className={`${PILL} ${selected.length === 0 ? ON : OFF}`}
      >
        الكل
      </button>
      {visible.map(({ name_tech: slug, name_arabic: name, count }) => {
        const on = selected.includes(slug);
        return (
          <button
            key={slug}
            type="button"
            onClick={() => toggle(slug)}
            aria-pressed={on}
            className={`${PILL} ${on ? ON : OFF}`}
          >
            <span>{name}</span>
            <span className={`text-xs tabular-nums ${on ? 'text-blue-100' : 'text-gray-400'}`}>{count}</span>
          </button>
        );
      })}
      {(hiddenCount > 0 || showAll) && items.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          className="rounded-full px-2 py-1 text-sm text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400"
        >
          {showAll ? 'أقل' : `مجالات أخرى (${hiddenCount})`}
        </button>
      )}
    </div>
  );
};

export default DomainFilter;
