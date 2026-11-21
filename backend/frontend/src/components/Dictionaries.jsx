// src/components/Dictionaries.jsx
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ExternalLink, BookOpen } from 'lucide-react';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import DomainFilter from './DomainFilter';
import DomainTags from './DomainTags';
import { fetchDicts, fetchStats } from '../api';

const Dictionaries = () => {
  const [dictionaries, setDictionaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  // The domains the list is narrowed to are the page's `?domain=`, so that a
  // list of one domain's dictionaries can be shared.
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = useMemo(
    () => [...new Set(searchParams.getAll('domain').filter(Boolean))],
    [searchParams]
  );
  const selectDomains = (next) => {
    const params = new URLSearchParams();
    next.forEach((slug) => params.append('domain', slug));
    setSearchParams(params, { replace: true });
  };

  // Every domain with its number of dictionaries, the largest first.
  const facets = useMemo(() => {
    const byslug = new Map();
    dictionaries.forEach((dict) =>
      (dict.domains ?? []).forEach((domain) => {
        const facet = byslug.get(domain.name_tech) ?? { ...domain, count: 0 };
        facet.count += 1;
        byslug.set(domain.name_tech, facet);
      })
    );
    return [...byslug.values()].sort((a, b) => b.count - a.count);
  }, [dictionaries]);

  // A dictionary of any of the selected domains qualifies.
  const shown = useMemo(
    () =>
      selected.length === 0
        ? dictionaries
        : dictionaries.filter((dict) =>
            (dict.domains ?? []).some((domain) => selected.includes(domain.name_tech))
          ),
    [dictionaries, selected]
  );

  // Total term count comes from /api/v1/stats (same source as the home
  // page), so the two numbers always agree; failure just shows '-'.
  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  // Fetch dictionaries on mount
  useEffect(() => {
    fetchDicts()
      .then(setDictionaries)
      .catch(() => setError('حدث خطأ في تحميل المعاجم'))
      .finally(() => setLoading(false));
  }, []);

  const themeClasses = 'bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white';

  const cardClasses = 'bg-white shadow-md dark:bg-gray-800';

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString('en-US');
  };

  const DICT_TYPE_LABELS = {
    terminology: 'معجم مصطلحات',
    language: 'معجم لغوي',
    thesaurus: 'مسرد وب',
  };

  const DICT_TYPE_CLASSES = {
    terminology: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    language: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    thesaurus: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };

  const DictTypeLabel = ({ dictType }) => {
    if (!DICT_TYPE_LABELS[dictType]) return null;
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${DICT_TYPE_CLASSES[dictType]}`}>
        {DICT_TYPE_LABELS[dictType]}
      </span>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col ${themeClasses}`} dir="rtl">
      <SiteHeader title="قائمة المعاجم" />

      {/* Content */}
      <div className="max-w-6xl mx-auto mt-8 px-4 pb-12 w-full">
        {/* Stats */}
        {!loading && !error && (
          <div className="mb-6 text-center">
            <p className="text-lg text-gray-600 dark:text-gray-300">
              <span>
                عدد المعاجم:{' '}
                <span className="font-bold">
                  {selected.length > 0
                    ? `${formatNumber(shown.length)} من ${formatNumber(dictionaries.length)}`
                    : formatNumber(dictionaries.length)}
                </span>
              </span>
              <span className="mx-3 text-gray-400" aria-hidden="true">·</span>
              <span>
                عدد المصطلحات: <span className="font-bold">{formatNumber(stats?.number_terms)}</span>
              </span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              اضغط على أي معجم لتصفّح محتواه كاملًا.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-lg">جارٍ التحميل...</p>
          </div>
        )}

        {/* Domain filter */}
        {!loading && !error && (
          <DomainFilter
            className="mb-6 justify-center"
            facets={facets}
            selected={selected}
            onChange={selectDomains}
          />
        )}

        {/* Dictionaries Grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((dict) => (
              <div
                key={dict.id}
                className={`${cardClasses} rounded-lg p-4 hover:shadow-lg transition-shadow relative ${dict.arabterm_url ? 'hover:ring-2 hover:ring-blue-400' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <BookOpen
                    size={24}
                    className="text-blue-500 flex-shrink-0 mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    {/* Dictionary type and domains. The domains are buttons
                        above the card's stretched link: a click narrows the
                        list to that domain, a second one widens it again. */}
                    {(DICT_TYPE_LABELS[dict.dict_type] || dict.domains?.length > 0) && (
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <DictTypeLabel dictType={dict.dict_type} />
                        <DomainTags
                          className="relative z-10"
                          domains={dict.domains}
                          selected={selected}
                          onSelect={(slug) =>
                            selectDomains(
                              selected.length === 1 && selected[0] === slug ? [] : [slug]
                            )
                          }
                        />
                      </div>
                    )}

                    {/* Arabic Name — the whole card links to the arabterm
                        page via the stretched ::after pseudo-element. */}
                    <h3 className="font-bold text-lg leading-tight mb-2">
                      {dict.arabterm_url ? (
                        <a
                          href={dict.arabterm_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="after:absolute after:inset-0 hover:text-blue-600 dark:hover:text-blue-400"
                          title="تصفّح المعجم في موقع arabterm"
                        >
                          {dict.name_arabic}
                        </a>
                      ) : (
                        dict.name_arabic
                      )}
                    </h3>

                    {/* English Name */}
                    {dict.name_english && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-1" dir="ltr">
                        {dict.name_english}
                      </p>
                    )}

                    {/* French Name */}
                    {dict.name_french && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic mb-2" dir="ltr">
                        {dict.name_french}
                      </p>
                    )}

                    {/* Stats Row */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        عدد المصطلحات: <span className="font-semibold">{formatNumber(dict.nbr_entries)}</span>
                      </span>

                      {/* Wikidata Link */}
                      {dict.wikidata_id && (
                        <a
                          href={`https://www.wikidata.org/wiki/${dict.wikidata_id}?uselang=ar`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative z-10 inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                          title="عنصر ويكي بيانات"
                        >
                          <ExternalLink size={14} />
                          <span>{dict.wikidata_id}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  );
};

export default Dictionaries;
