// src/components/DictionaryApp.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Search, ExternalLink, ChevronDown, ChevronUp, Quote, Copy, Check, BookOpen, Wrench, ArrowLeft } from 'lucide-react';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

const formatNumber = (num) =>
  num === null || num === undefined ? '…' : num.toLocaleString('en-US');

// Result groups fetched per request (same step as the on-wiki gadget). Broad
// queries have thousands of groups; downloading them all took several seconds.
const PAGE_SIZE = 30;
// The API rejects longer queries (a pasted paragraph is not a term).
const MAX_QUERY_LENGTH = 200;

// Shown under the search box while it is empty: points first-time visitors
// to the two other pages and fills what would otherwise be a blank screen.
const LandingCards = ({ stats }) => {
  const cards = [
    {
      to: '/dictionaries',
      icon: BookOpen,
      title: 'تصفّح المعاجم',
      description: 'المعاجم المصدرية بأنواعها، مع رابط لتصفّح كل معجم.',
      facts: [`${formatNumber(stats?.number_dictionaries)} معجمًا`, `${formatNumber(stats?.number_terms)} مصطلح`],
    },
    {
      to: '/tools',
      icon: Wrench,
      title: 'منظومة الأدوات',
      description: 'أدوات مفتوحة المصدر لحوسبة اللغة العربية.',
      facts: ['صرفي', 'دلالي', 'معجمي'],
    },
  ];

  // Deliberately quiet: no shadow, muted text, well below the search box,
  // so the search bar stays the obvious primary action.
  return (
    <div className="max-w-3xl w-full mx-auto mt-16 px-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {cards.map(({ to, icon: Icon, title, description, facts }) => (
        <Link
          key={to}
          to={to}
          className="group rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 hover:border-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-colors flex items-start gap-3"
        >
          <Icon size={20} className="text-gray-400 group-hover:text-blue-500 flex-shrink-0 mt-0.5 transition-colors" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1">
              {title}
              <ArrowLeft
                size={14}
                className="text-gray-400 transition-transform group-hover:-translate-x-1"
              />
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{facts.join(' · ')}</p>
          </div>
        </Link>
      ))}
    </div>
  );
};

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
  // Total groups for the current query; `results` holds the pages loaded so far.
  const [totalGroups, setTotalGroups] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [openPopupId, setOpenPopupId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [stats, setStats] = useState(null);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  // Only one request in flight: a new search cancels the previous one, so a
  // slow response for a broad term can't overwrite the results of a newer one.
  const abortRef = useRef(null);
  // Term the displayed results belong to. "Show more" must page that one, not
  // whatever is in the input while the debounce is still pending.
  const resultsTermRef = useRef('');

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Counts for the landing cards; failure just leaves the placeholders.
  useEffect(() => {
    fetch('/api/v1/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
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

  // Cleanup timeout and in-flight request on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  const toggleGroup = (index) => {
    setExpandedGroups(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Arabic count agreement (1 = bare singular, 2 = dual, 3-10 = plural,
  // 11+ = singular tamyiz) for each dictionary-type bucket.
  const TERMINOLOGY_FORMS = { one: 'معجم مصطلحات واحد', two: 'معجمي مصطلحات', few: 'معاجم مصطلحات', many: 'معجم مصطلحات' };
  const LANGUAGE_FORMS = { one: 'معجم لغوي واحد', two: 'معجمين لغويين', few: 'معاجم لغوية', many: 'معجم لغوي' };
  const THESAURUS_FORMS = { one: 'مسرد وب واحد', two: 'مسردي وب', few: 'مسارد وب', many: 'مسرد وب' };
  // Fallback for dictionaries not yet classified with a dict_type.
  const GENERIC_FORMS = { one: 'معجم واحد', two: 'معجمين', few: 'معاجم', many: 'معجما' };

  const formatCountClause = (count, forms) => {
    if (count === 1) return forms.one;
    if (count === 2) return forms.two;
    if (count <= 10) return `${count} ${forms.few}`;
    return `${count} ${forms.many}`;
  };

  const formatDictionaryCount = (occurences) => {
    if (occurences.length === 0) return 'لم يرد في أي معجم';

    const countByType = { terminology: 0, language: 0, thesaurus: 0, other: 0 };
    occurences.forEach((o) => {
      const type = o.dictionary_dict_type;
      countByType[type in countByType ? type : 'other'] += 1;
    });

    const clauses = [];
    if (countByType.terminology > 0) clauses.push(formatCountClause(countByType.terminology, TERMINOLOGY_FORMS));
    if (countByType.language > 0) clauses.push(formatCountClause(countByType.language, LANGUAGE_FORMS));
    if (countByType.thesaurus > 0) clauses.push(formatCountClause(countByType.thesaurus, THESAURUS_FORMS));
    if (countByType.other > 0) clauses.push(formatCountClause(countByType.other, GENERIC_FORMS));

    return `ورد في ${clauses.join(' و ')}:`;
  };

  const formatDictionaryInfo = (occurrence) => {
    const parts = [];
    // Dictionary name links to its browsable page on arabterm (GitHub Pages),
    // keyed by the dictionary's `name_tech` slug.
    parts.push(
      occurrence.dictionary_name_tech ? (
        <a
          href={`https://forzagreen.github.io/arabterm/${occurrence.dictionary_name_tech}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-600 hover:underline dark:hover:text-blue-400"
          title="تصفّح المعجم في موقع arabterm"
        >
          {occurrence.dictionary_name_arabic}
        </a>
      ) : (
        occurrence.dictionary_name_arabic
      )
    );

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
              className="inline-flex items-center text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 transition-colors citation-popup"
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

  // One page of grouped results. `number_groups` is the total for the query.
  const fetchPage = async (term, offset, signal) => {
    const response = await fetch(
      `/api/v1/search/aggregated?q="${encodeURIComponent(term)}"&limit=${PAGE_SIZE}&offset=${offset}`,
      { signal }
    );
    if (!response.ok) {
      throw new Error('حدث خطأ في البحث. الرجاء المحاولة مرة أخرى.');
    }
    return response.json();
  };

  // Cancels whatever is in flight and returns the controller for a new request.
  const startRequest = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  };

  // Search function with debouncing
  const handleSearch = async (term) => {
    if (term.trim().length < 3) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setLoadingMore(false);
      setResults([]);
      setTotalGroups(0);
      return;
    }

    const controller = startRequest();
    setLoading(true);
    setLoadingMore(false);
    setLoadMoreFailed(false);
    setError(null);

    try {
      const data = await fetchPage(term, 0, controller.signal);

      if (data && Array.isArray(data.groups)) {
        resultsTermRef.current = term;
        setResults(data.groups);
        setTotalGroups(data.number_groups ?? data.groups.length);
        const initialExpanded = data.groups.reduce((acc, _, index) => {
          acc[index] = true;
          return acc;
        }, {});
        setExpandedGroups(initialExpanded);
      } else {
        setResults([]);
        setTotalGroups(0);
        setError('لم يتم العثور على نتائج');
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // superseded by a newer search
      setError(err.message);
      setResults([]);
      setTotalGroups(0);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  // Appends the next page of the displayed query.
  const loadMore = async () => {
    const offset = results.length;
    const controller = startRequest();
    setLoadingMore(true);
    setLoadMoreFailed(false);

    try {
      const data = await fetchPage(resultsTermRef.current, offset, controller.signal);
      const groups = Array.isArray(data?.groups) ? data.groups : [];
      setResults((prev) => [...prev, ...groups]);
      setTotalGroups(data?.number_groups ?? offset + groups.length);
      setExpandedGroups((prev) => {
        const next = { ...prev };
        groups.forEach((_, index) => {
          next[offset + index] = true;
        });
        return next;
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setLoadMoreFailed(true);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoadingMore(false);
      }
    }
  };

  const handleSearchInputChange = (e) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Wait 600 ms before searching
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(newTerm);
    }, 600);
  };

  const themeClasses = 'bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white';

  const cardClasses = 'bg-white shadow-md dark:bg-gray-800';

  const inputClasses =
    'bg-white border-gray-300 text-gray-900 placeholder-gray-500 ' +
    'dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-400';

  const occurrenceClasses = 'bg-gray-50 dark:bg-gray-700';

  const LanguageLabel = ({ lang }) => (
    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      {lang}
    </span>
  );

  return (
    <div className={`min-h-screen flex flex-col ${themeClasses}`} dir="rtl">
      <SiteHeader title="مسرد الويكي" />

      {/* Search Bar */}
      <div className="max-w-4xl w-full mx-auto mt-8 px-4">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            className={`w-full px-5 py-4 text-lg rounded-xl border shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${inputClasses}`}
            placeholder="ابحث عن مصطلح (بالإنجليزية أو الفرنسية أو العربية)..."
            maxLength={MAX_QUERY_LENGTH}
            value={searchTerm}
            onChange={handleSearchInputChange}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={26} />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-4xl w-full mx-auto mt-4 px-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-4xl w-full mx-auto mt-8 text-center">
          <p className="text-lg">جارٍ البحث...</p>
        </div>
      )}

      {/* Landing cards (empty search box only) */}
      {searchTerm.trim().length === 0 && <LandingCards stats={stats} />}

      {/* Results Section */}
      <div className="max-w-4xl mx-auto mt-8 px-4 pb-12 w-full">
        {!loading && !error && results.length === 0 && searchTerm.trim().length >= 3 && (
          <div className={`${cardClasses} rounded-lg p-6 text-center`}>
            <p className="text-lg">عذرًا، لم نعثر على أي نتائج.</p>
          </div>
        )}
        {!loading && !error && results.length === 0 && searchTerm.trim().length > 0 && searchTerm.trim().length < 3 && (
          <div className={`${cardClasses} rounded-lg p-6 text-center`}>
            <p className="text-lg">يرجى إدخال 3 أحرف على الأقل للبحث.</p>
          </div>
        )}
        {results.map((group, index) => {
          // Elected by the API over all the groups of the query (at most one).
          const isTopResult = group.suggested === true;

          return (
          <div key={index} className={`${cardClasses} rounded-lg mb-6 p-6 ${isTopResult ? 'border-2 border-blue-500' : ''}`}>
            {/* Card Header */}
            <div className="flex items-center mb-4">
              <span className="text-lg font-semibold text-blue-600 ml-4">{index + 1}</span>
              <div className="flex-1 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="text-right">
                  <span className="text-xl font-bold">{group.arabic_normalised}</span>
                </div>
                {isTopResult && (
                  <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded dark:bg-blue-200 dark:text-blue-800 mb-2 sm:mb-0 self-center sm:self-auto">
                    الترجمة المقترحة
                  </span>
                )}
                <div dir="ltr" className="text-left overflow-hidden">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <LanguageLabel lang="en" />
                      <span className="text-xl font-bold break-words">{group.english_normalised}</span>
                    </div>
                    {group.french_normalised && (
                      <div className="flex items-center gap-2">
                        <LanguageLabel lang="fr" />
                        <span className="text-lg text-gray-600 dark:text-gray-300 italic break-words">
                          {group.french_normalised}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Dictionary entries section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-gray-500">
                  {formatDictionaryCount(group.occurences)}
                </p>
                <button
                  onClick={() => toggleGroup(index)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
                      <div className="mt-2 flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="text-right">
                          <span>{occurrence.arabic}</span>
                        </div>
                        <div dir="ltr" className="text-left overflow-hidden">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <LanguageLabel lang="en" />
                              <span className="text-gray-700 dark:text-gray-300 break-words">
                                {occurrence.english}
                              </span>
                            </div>
                            {occurrence.french && (
                              <div className="flex items-center gap-2">
                                <LanguageLabel lang="fr" />
                                <span className="text-gray-600 dark:text-gray-400 italic break-words">
                                  {occurrence.french}
                                </span>
                              </div>
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

        {/* Next page */}
        {!loading && results.length > 0 && results.length < totalGroups && (
          <div className="text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-5 py-2.5 rounded-lg border border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-60 disabled:cursor-wait dark:text-blue-400 dark:border-blue-400 dark:hover:bg-gray-800"
            >
              {loadingMore
                ? 'جارٍ التحميل...'
                : `عرض المزيد من النتائج (${formatNumber(totalGroups - results.length)})`}
            </button>
            {loadMoreFailed && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
                تعذّر تحميل المزيد من النتائج. الرجاء المحاولة مرة أخرى.
              </p>
            )}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  );
};

export default DictionaryApp;
