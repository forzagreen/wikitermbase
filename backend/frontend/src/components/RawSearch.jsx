// src/components/RawSearch.jsx
import React, { useState, useEffect } from 'react';
import { Search, ExternalLink, ChevronDown, ChevronUp, Link2, Loader2, Quote, Check, Copy } from 'lucide-react';

const RawSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [morphResults, setMorphResults] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [openPopupId, setOpenPopupId] = useState(null);

  // Add click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openPopupId && !event.target.closest('.citation-popup')) {
        setOpenPopupId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openPopupId]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
        if (isArabic(searchQuery)) {
          performMorphAnalysis(searchQuery);
        } else {
          setMorphResults(null);
        }
      } else {
        setResults([]);
        setMorphResults(null);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const isArabic = (text) => {
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  };

  const performSearch = async (query) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
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

  const performMorphAnalysis = async (query) => {
    try {
      const response = await fetch(`/morph_analyzer?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('حدث خطأ في التحليل الصرفي');
      }
      const data = await response.json();
      setMorphResults(data.results?.[0] || null);
    } catch (err) {
      console.error('Morph analysis error:', err);
      setMorphResults(null);
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
            autoFocus
          />
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
            {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
          </div>
        </div>
      </div>

      {/* Morphological Analysis Section */}
      {morphResults && morphResults.lemma_id !== 0 && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-bold mb-2">التحليل الصرفي</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="text-gray-600">الأساس:</span>
              <a 
                href={`https://sina.birzeit.edu/qabas/lemma/${morphResults.lemma_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-2 font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
              >
                {morphResults.lemma}
                <ExternalLink size={14} />
              </a>
            </div>
            <div>
              <span className="text-gray-600">الجذر:</span>
              <span className="mr-2 font-bold">{morphResults.root}</span>
            </div>
            <div>
              <span className="text-gray-600">السمة الصرفية:</span>
              <span className="mr-2 font-bold">{morphResults.pos}</span>
            </div>
          </div>
        </div>
      )}

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
        {results.map((item, index) => (
          <div key={item.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors p-6 relative">
            {/* Side Column for Number and Link */}
            <div className="absolute top-4 right-4 flex flex-col items-center space-y-2 w-8">
              <div className="text-lg font-semibold text-gray-400">
                {index + 1}
              </div>
              
              {item.uri && (
                <a
                  href={item.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                >
                  <Link2 size={16} />
                </a>
              )}
            </div>

            {/* Main Term Row */}
            <div className="flex justify-between items-start mb-2 pr-16">
              <h2 className="text-2xl font-bold">{item.arabic}</h2>
              <div className="text-left" dir="ltr">
                <div className="text-xl font-semibold text-gray-800">{item.english}</div>
                <div className="text-lg text-gray-600">{item.french}</div>
              </div>
            </div>

            {/* Dictionary Info */}
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
              <span>{item.dictionary_name_arabic}</span>
              {item.page && (
                <>
                  <span>•</span>
                  <span>ص. {item.page}</span>
                </>
              )}
              {item.dictionary_wikidata_id && (
                <>
                  <span>•</span>
                  <span>
                    QID: <a
                      href={`https://www.wikidata.org/wiki/${item.dictionary_wikidata_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative text-blue-600 hover:text-blue-800"
                    >
                      {item.dictionary_wikidata_id}
                      <span className="absolute bottom-full right-1/2 transform translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-sm px-2 py-1 rounded whitespace-nowrap">
                        عنصر ويكي بيانات
                      </span>
                    </a>
                  </span>
                  <span>•</span>
                  <span className="relative">
                    <button
                      className="inline-flex items-center text-gray-600 hover:text-blue-600 transition-colors citation-popup"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenPopupId(openPopupId === item.id ? null : item.id);
                      }}
                    >
                      <Quote size={16} />
                      <span className="mr-1">استشهاد</span>
                    </button>
                      
                    {/* Citation Preview Popup */}
                    {openPopupId === item.id && (
                      <div 
                        className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10 citation-popup w-auto sm:w-96 bottom-4 sm:bottom-full sm:mb-2"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-gray-900">رمز الاستشهاد</span>
                          <button
                            className="text-gray-600 hover:text-blue-600 flex items-center gap-1 transition-colors"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const citation = item.page 
                                ? `{{استشهاد بويكي بيانات|${item.dictionary_wikidata_id}|ص=${item.page}}}`
                                : `{{استشهاد بويكي بيانات|${item.dictionary_wikidata_id}}}`;
                              
                              try {
                                await navigator.clipboard.writeText(citation);
                                setCopiedId(item.id);
                                setTimeout(() => setCopiedId(null), 2000);
                              } catch (err) {
                                console.error('Failed to copy:', err);
                              }
                            }}
                          >
                            {copiedId === item.id ? (
                              <>
                                <Check size={16} className="text-green-600" />
                                <span className="text-green-600">تم النسخ</span>
                              </>
                            ) : (
                              <>
                                <Copy size={16} />
                                <span>نسخ</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="bg-gray-50 p-2 rounded text-sm font-mono text-gray-800 overflow-x-auto border border-gray-100 break-all">
                          {item.page 
                            ? `{{استشهاد بويكي بيانات|${item.dictionary_wikidata_id}|ص=${item.page}}}`
                            : `{{استشهاد بويكي بيانات|${item.dictionary_wikidata_id}}}`
                          }
                        </div>
                      </div>
                    )}
                  </span>
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

export default RawSearch;
