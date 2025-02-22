// src/components/DictionaryApp.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, ExternalLink, ChevronDown, ChevronUp, Moon, Sun, Quote, Copy, Check } from 'lucide-react';

const ExpandableText = ({ text, charLimit = 200 }) => {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded((prev) => !prev);

  // Check if text exceeds the character limit
  const shouldTruncate = text.length > charLimit;
  const displayText = expanded || !shouldTruncate ? text : `${text.substring(0, charLimit)}...`;

  return (
    <div className="mt-2">
      <p className="text-sm text-gray-600 dark:text-gray-300">{displayText}</p>
      {shouldTruncate && (
        <button 
          onClick={toggleExpanded} 
          className="mt-1 text-blue-600 hover:underline focus:outline-none dark:text-blue-400 dark:hover:text-blue-300"
        >
          {expanded ? 'قَلِّل' : 'وسِّع'}
        </button>
      )}
    </div>
  );
};

const DictionaryApp = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [openPopupId, setOpenPopupId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Initialize dark mode from system preference
  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
    }
  }, []);

  // Handle click outside citation popup
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openPopupId && !event.target.closest('.citation-popup')) {
        setOpenPopupId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openPopupId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const toggleGroup = (index) => {
    setExpandedGroups(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const formatDictionaryCount = (count) => {
    if (count === 0) return 'لم يرد في أي معجم';
    if (count === 1) return 'ورد في معجم واحد:';
    if (count === 2) return 'ورد في معجمين:';
    if (count >= 11) return `ورد في ${count} معجماً:`;
    return `ورد في ${count} معاجم:`;
  };

  const formatDictionaryInfo = (occurrence) => {
    const parts = [];
    parts.push(occurrence.dictionary_name_arabic);
    
    if (occurrence.page) {
      parts.push(`ص. ${occurrence.page}`);
    }
    
    if (occurrence.dictionary_wikidata_id) {
      parts.push(
        <span title="عنصر ويكي بيانات">
          QID: <a 
            href={`https://wikidata.org/wiki/${occurrence.dictionary_wikidata_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >{occurrence.dictionary_wikidata_id}</a>
        </span>
      )

      parts.push(
        <div key="wikidata" className="inline-flex items-center">
          <span className="relative mr-2">
            <button
              className="inline-flex items-center text-gray-600 hover:text-blue-600 transition-colors citation-popup"
              onClick={(e) => {
                e.stopPropagation();
                setOpenPopupId(openPopupId === occurrence.id ? null : occurrence.id);
              }}
            >
              <Quote size={16} />
              <span className="mr-1">استشهاد</span>
            </button>
            
            {openPopupId === occurrence.id && (
              <div 
                className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-10 citation-popup w-auto sm:w-96 bottom-4 sm:bottom-full sm:mb-2"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">رمز الاستشهاد</span>
                  <button
                    className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const citation = occurrence.page 
                        ? `{{استشهاد بويكي بيانات|${occurrence.dictionary_wikidata_id}|ص=${occurrence.page}}}`
                        : `{{استشهاد بويكي بيانات|${occurrence.dictionary_wikidata_id}}}`;
                      
                      try {
                        await navigator.clipboard.writeText(citation);
                        setCopiedId(occurrence.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      } catch (err) {
                        console.error('Failed to copy:', err);
                      }
                    }}
                  >
                    {copiedId === occurrence.id ? (
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
                <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded text-sm font-mono text-gray-800 dark:text-gray-200 overflow-x-auto border border-gray-100 dark:border-gray-700 break-all">
                  {occurrence.page 
                    ? `{{استشهاد بويكي بيانات|${occurrence.dictionary_wikidata_id}|ص=${occurrence.page}}}`
                    : `{{استشهاد بويكي بيانات|${occurrence.dictionary_wikidata_id}}}`
                  }
                </div>
              </div>
            )}
          </span>
        </div>
      );
    }
    
    return parts.map((part, index) => (
      <React.Fragment key={index}>
        {index > 0 && <span className="mx-2">•</span>}
        {part}
      </React.Fragment>
    ));
  };

  // Search function with debouncing
  const handleSearch = async (term) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/search/aggregated?q=${encodeURIComponent(term)}`);
      if (!response.ok) {
        throw new Error('حدث خطأ في البحث. الرجاء المحاولة مرة أخرى.');
      }
      const data = await response.json();
      
      if (data && Array.isArray(data.groups)) {
        setResults(data.groups);
        const initialExpanded = data.groups.reduce((acc, _, index) => {
          acc[index] = true;
          return acc;
        }, {});
        setExpandedGroups(initialExpanded);
      } else {
        setResults([]);
        setError('لم يتم العثور على نتائج');
      }
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchInputChange = (e) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(newTerm);
    }, 300);
  };

  const themeClasses = darkMode ? 
    'bg-gray-900 text-white' : 
    'bg-gray-50 text-gray-900';

  const cardClasses = darkMode ?
    'bg-gray-800 shadow-md' :
    'bg-white shadow-md';

  const inputClasses = darkMode ?
    'bg-gray-800 border-gray-600 text-white placeholder-gray-400' :
    'bg-white border-gray-300 text-gray-900 placeholder-gray-500';

  const occurrenceClasses = darkMode ?
    'bg-gray-700' :
    'bg-gray-50';

  const LanguageLabel = ({ lang }) => (
    <span className={`text-xs px-1.5 py-0.5 rounded ${
      darkMode 
        ? 'bg-gray-700 text-gray-300' 
        : 'bg-gray-200 text-gray-600'
    }`}>
      {lang}
    </span>
  );

  return (
    <div className={`min-h-screen ${themeClasses}`} dir="rtl">
      {/* Header */}
      <header className={cardClasses}>
        <div className="max-w-7xl mx-auto py-6 px-4">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-center flex-1">
              مسرد الويكي
            </h1>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {darkMode ? <Sun size={24} /> : <Moon size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="max-w-3xl mx-auto mt-8 px-4">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${inputClasses}`}
            placeholder="ابحث عن مصطلح (بالإنجليزية أو الفرنسية أو العربية)..."
            value={searchTerm}
            onChange={handleSearchInputChange}
          />
          <Search className="absolute left-3 top-3 text-gray-400" size={24} />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-3xl mx-auto mt-4 px-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-3xl mx-auto mt-8 text-center">
          <p className="text-lg">جارٍ البحث...</p>
        </div>
      )}

      {/* Results Section */}
      <div className="max-w-4xl mx-auto mt-8 px-4 pb-12">
        {!loading && !error && results.length === 0 && searchTerm && (
          <div className={`${cardClasses} rounded-lg p-6 text-center`}>
            <p className="text-lg">عذرًا، لم نعثر على أي نتائج.</p>
          </div>
        )}
        {results.map((group, index) => {
          const occurrencesCounts = results.map(g => g.occurences.length);
          const maxOccurrences = Math.max(...occurrencesCounts);
          const topResultsCount = occurrencesCounts.filter(count => count === maxOccurrences).length;
          const isTopResult = group.occurences.length === maxOccurrences && topResultsCount === 1; // Check if only one top result

          return (
          <div key={index} className={`${cardClasses} rounded-lg mb-6 p-6 ${isTopResult ? 'border-2 border-blue-500' : ''}`}>
            {/* Card Header */}
            <div className="flex items-center mb-4">
              <span className="text-lg font-semibold text-blue-600 ml-4">{index + 1}</span>
              <div className="flex-1 flex items-start gap-8">
                <div className="text-right flex-shrink-0">
                  <span className="text-xl font-bold">{group.arabic_normalised}</span>
                </div>
                {isTopResult && (
                  <span className="bg-blue-100 text-blue-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded dark:bg-blue-200 dark:text-blue-800">
                    الترجمة المقترحة
                  </span>
                )}
                <div dir="ltr" className="flex-1 text-left">
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <LanguageLabel lang="en" />
                      <span className="text-xl font-bold">{group.english_normalised}</span>
                    </div>
                    {group.french_normalised && (
                      <div className="flex items-center gap-2">
                        <LanguageLabel lang="fr" />
                        <span className="text-lg text-gray-600 dark:text-gray-300 italic">
                          {group.french_normalised}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Dictionary entries section */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-gray-500">
                  {formatDictionaryCount(group.occurences.length)}
                </p>
                <button 
                  onClick={() => toggleGroup(index)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  {expandedGroups[index] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>
              
              {expandedGroups[index] && group.occurences.map((occurrence, occIndex) => (
                <div key={occIndex} className={`mb-2 last:mb-0 ${occurrenceClasses} p-3 rounded`}>
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 mb-1">
                        {formatDictionaryInfo(occurrence)}
                      </p>
                      <div className="mt-2 flex items-start gap-8">
                        <div className="text-right flex-shrink-0">
                          <span>{occurrence.arabic}</span>
                        </div>
                        <div dir="ltr" className="flex-1 text-left">
                          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                            <div className="inline-flex items-center gap-2">
                              <LanguageLabel lang="en" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {occurrence.english}
                              </span>
                            </div>
                            {occurrence.french && (
                              <>
                                <span className="hidden sm:inline text-gray-400">•</span>
                                <div className="inline-flex items-center gap-2">
                                  <LanguageLabel lang="fr" />
                                  <span className="text-gray-600 dark:text-gray-400 italic">
                                    {occurrence.french}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Arabic description section */}
                      {occurrence.description && (
                        <ExpandableText text={occurrence.description} />
                      )}
                    </div>
                    {occurrence.uri && (
                      <a 
                        href={occurrence.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-blue-600 mr-2"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )})}
      </div>
    </div>
  );
};

export default DictionaryApp;
