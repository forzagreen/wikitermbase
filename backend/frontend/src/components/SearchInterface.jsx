import React, { useState, useEffect } from 'react';
import { Search, ExternalLink, ChevronDown, ChevronUp, Link2, Loader2 } from 'lucide-react';

const SearchInterface = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const performSearch = async (query) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('حدث خطأ في البحث');
      }
      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDescription = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <div className="max-w-4xl mx-auto p-4" dir="rtl">
      {/* Search Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4 text-right">قاموس المصطلحات التقنية</h1>
        <div className="relative">
          <input
            type="text"
            placeholder="ابحث عن مصطلح..."
            className="w-full p-4 pl-12 text-lg rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
            {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-red-600 bg-red-50 p-4 rounded-lg mb-4 text-center">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && searchQuery && results.length === 0 && !error && (
        <div className="text-center py-8 text-gray-500">
          لا توجد نتائج للبحث عن "{searchQuery}"
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        {results.map((item) => (
          <div key={item.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors p-6">
            {/* Main Term Row */}
            <div className="flex justify-between items-start mb-2">
              <div className="flex-grow">
                <h2 className="text-2xl font-bold mb-2">{item.arabic}</h2>
                <div className="flex flex-wrap gap-4 text-lg">
                  <span className="text-gray-700">{item.english}</span>
                  <span className="text-gray-700">{item.french}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {item.uri && (
                  <a href={item.uri} target="_blank" rel="noopener noreferrer" 
                     className="text-blue-600 hover:text-blue-800">
                    <Link2 size={18} />
                  </a>
                )}
              </div>
            </div>

            {/* Dictionary Info */}
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
              <span>{item.dictionary_name_arabic}</span>
              {item.dictionary_wikidata_id && (
                <>
                  <span>•</span>
                  <a
                    href={`https://www.wikidata.org/wiki/${item.dictionary_wikidata_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                  >
                    {item.dictionary_wikidata_id}
                    <ExternalLink size={14} />
                  </a>
                </>
              )}
            </div>

            {/* Description (if exists) */}
            {item.description && (
              <div className="mt-4">
                <button
                  onClick={() => toggleDescription(item.id)}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
                >
                  <span>التفاصيل</span>
                  {expandedItems.has(item.id) ? (
                    <ChevronUp size={20} />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </button>
                {expandedItems.has(item.id) && (
                  <p className="mt-2 text-gray-600 bg-gray-50 p-4 rounded-lg">
                    {item.description}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchInterface;
