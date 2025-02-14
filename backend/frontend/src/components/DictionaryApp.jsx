// src/components/DictionaryApp.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, ExternalLink, ChevronDown, ChevronUp, Moon, Sun } from 'lucide-react';

const DictionaryApp = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
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

  // Function to format dictionary count in Arabic
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
      parts.push(`QID: ${occurrence.dictionary_wikidata_id}`);
    }
    
    return parts.join(' • ');
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
      
      // Check if data contains groups array
      if (data && Array.isArray(data.groups)) {
        setResults(data.groups);
        
        // Initialize expanded state for new results
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

  // Handle search input change with debouncing
  const handleSearchInputChange = (e) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(newTerm);
    }, 300); // 300ms delay
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
            placeholder="ابحث عن مصطلح..."
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
        {results.map((group, index) => (
          <div key={index} className={`${cardClasses} rounded-lg mb-6 p-6`}>
            {/* Header with term numbers */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-lg font-semibold text-blue-600">{index + 1}</span>
              <div className="flex flex-1 justify-between items-baseline">
                <div className="text-right">
                  <span className="text-xl font-bold">{group.arabic_normalised}</span>
                </div>
                <div dir="ltr" className="text-left">
                  <span className="text-xl font-bold">{group.english_normalised}</span>
                  <span className="text-sm text-gray-500 mx-3">•</span>
                  <span className="text-sm text-gray-500">{group.french_normalised}</span>
                </div>
              </div>
            </div>

            {/* Dictionary entries */}
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
                      <div className="mt-2 space-x-3 space-x-reverse mr-6">
                        <span className="text-right">{occurrence.arabic}</span>
                        <span className="text-gray-400">•</span>
                        <span dir="ltr" className="text-gray-500">{occurrence.english}</span>
                        <span className="text-gray-400">•</span>
                        <span dir="ltr" className="text-gray-500">{occurrence.french}</span>
                      </div>
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
        ))}
      </div>
    </div>
  );
};

export default DictionaryApp;
