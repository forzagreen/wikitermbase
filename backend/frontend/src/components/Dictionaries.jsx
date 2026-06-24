// src/components/Dictionaries.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { ExternalLink, BookOpen } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

const Dictionaries = () => {
  const [dictionaries, setDictionaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div className={`min-h-screen ${themeClasses}`} dir="rtl">
      {/* Header */}
      <header className={cardClasses}>
        <div className="max-w-7xl mx-auto py-6 px-4">
          <div className="flex justify-between items-center">
            <Link to="/" title="الصفحة الرئيسية">
              <Logo className="h-10" />
            </Link>
            <h1 className="text-3xl font-bold">قائمة المعاجم</h1>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto mt-8 px-4 pb-12">
        {/* Stats */}
        {!loading && !error && (
          <div className="mb-6 text-center">
            <p className="text-lg text-gray-600 dark:text-gray-300">
              عدد المعاجم: <span className="font-bold">{formatNumber(dictionaries.length)}</span>
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
                className={`${cardClasses} rounded-lg p-4 hover:shadow-lg transition-shadow`}
              >
                <div className="flex items-start gap-3">
                  <BookOpen
                    size={24}
                    className="text-blue-500 flex-shrink-0 mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    {/* Arabic Name */}
                    <h3 className="font-bold text-lg leading-tight mb-2">
                      {dict.name_arabic}
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
                          className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
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
    </div>
  );
};

export default Dictionaries;
