// src/components/DomainTags.jsx
//
// The domains of a dictionary («رياضيات», «طب») as small pills: what the API
// returns as `dictionary_domains` (an entry), and as `domains` (a result
// group, a dictionary). With `onSelect` the pills are buttons, which narrow
// the list to their domain; without it they are plain labels, for a result
// group's header, where nothing is clickable. `selected` (slugs) marks the
// domains the list is narrowed to; `max` folds the rest into «+N».
const BASE = 'inline-block rounded-full border px-2 py-px text-xs font-medium whitespace-nowrap';
const QUIET =
  'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300';
const ACTIVE = 'border-blue-600 bg-blue-600 text-white';
const HOVER = 'transition-colors hover:border-blue-400 hover:text-blue-700 dark:hover:text-blue-300';

const DomainTags = ({ domains, max, onSelect, selected = [], className = '' }) => {
  if (!domains?.length) return null;
  const shown = max ? domains.slice(0, max) : domains;
  const hidden = domains.slice(shown.length);

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 align-middle ${className}`}>
      {shown.map(({ name_tech: slug, name_arabic: name }) => {
        const active = selected.includes(slug);
        if (!onSelect) {
          return (
            <span key={slug} className={`${BASE} ${QUIET}`}>
              {name}
            </span>
          );
        }
        return (
          <button
            key={slug}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(slug);
            }}
            aria-pressed={active}
            title={active ? `إلغاء الحصر في مجال «${name}»` : `حصر النتائج في مجال «${name}»`}
            className={`${BASE} ${active ? ACTIVE : `${QUIET} ${HOVER}`} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
          >
            {name}
          </button>
        );
      })}
      {hidden.length > 0 && (
        <span
          className={`${BASE} border-transparent text-gray-500 dark:text-gray-400`}
          title={hidden.map((d) => d.name_arabic).join('، ')}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
};

export default DomainTags;
