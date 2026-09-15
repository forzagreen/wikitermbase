// src/components/Dictionaries.jsx
import { useState, useEffect } from 'react';
import { ExternalLink, BookOpen } from 'lucide-react';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

const Dictionaries = () => {
  const [dictionaries, setDictionaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  // Total term count comes from /api/v1/stats (same source as the home
  // page), so the two numbers always agree; failure just shows '-'.
  useEffect(() => {
    fetch('/api/v1/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  // Fetch dictionaries on mount
  useEffect(() => {
    const fetchDictionaries = async () => {
      try {
        const response = await fetch('/api/v1/dicts');
        if (!response.ok) {
          throw new Error('حدث خطأ في تحميل المعاجم');
        }
        const data = await response.json();
        setDictionaries(data.dictionaries || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDictionaries();
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
                عدد المعاجم: <span className="font-bold">{formatNumber(dictionaries.length)}</span>
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

        {/* Dictionaries Grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dictionaries.map((dict) => (
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
                    {/* Dictionary Type */}
                    {DICT_TYPE_LABELS[dict.dict_type] && (
                      <div className="mb-2">
                        <DictTypeLabel dictType={dict.dict_type} />
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
                          href={`https://www.wikidata.org/wiki/${dict.wikidata_id}`}
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
