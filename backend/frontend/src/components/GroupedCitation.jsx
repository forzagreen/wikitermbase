// src/components/GroupedCitation.jsx
//
// «تجميع الاستشهادات»: the citations of a result group in one numbered
// reference ({{ترقيم استشهادات}}), with a checklist to leave some out. Same
// text as the on-wiki gadget.
import { useState } from 'react';
import { Quote, Copy, Check } from 'lucide-react';
import { MAX_GROUPED_CITATIONS, groupedCitationTemplate } from '../citations';

// Mounted on opening, so every opening starts from a fresh checklist: all
// ticked, up to the template's limit.
const GroupedCitationPopup = ({ citations }) => {
  const [selected, setSelected] = useState(() => citations.map((_, i) => i < MAX_GROUPED_CITATIONS));
  const [copied, setCopied] = useState(false);
  const full = selected.filter(Boolean).length >= MAX_GROUPED_CITATIONS;
  const text = groupedCitationTemplate(citations.filter((_, i) => selected[i]).map((c) => c.template));

  const toggle = (index) => setSelected((prev) => prev.map((value, i) => (i === index ? !value : value)));

  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed sm:absolute left-4 right-4 sm:right-auto sm:left-0 bottom-4 sm:bottom-auto sm:top-full sm:mt-2 w-auto sm:w-[28rem] max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-10 citation-popup">
      <div className="flex justify-between items-center mb-2">
        <span className="font-semibold text-gray-900 dark:text-gray-100">رمز الاستشهادات المجمّعة</span>
        <button
          className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors disabled:opacity-50"
          onClick={copy}
          disabled={!text}
        >
          {copied ? (
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
      <ul className="max-h-44 overflow-y-auto mb-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
        {citations.map(({ occurrence, template }, index) => (
          <li key={template}>
            <label className={`flex items-start gap-2 ${full && !selected[index] ? 'opacity-50' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                className="mt-1"
                checked={selected[index]}
                disabled={full && !selected[index]}
                onChange={() => toggle(index)}
              />
              <span>
                {occurrence.dictionary_name_arabic}
                {occurrence.page && `، ص. ${occurrence.page}`}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {citations.length > MAX_GROUPED_CITATIONS && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          يجمع القالب {MAX_GROUPED_CITATIONS} استشهادًا على الأكثر.
        </p>
      )}
      <pre className="max-h-48 overflow-auto whitespace-pre bg-gray-50 dark:bg-gray-900 p-2 rounded text-xs sm:text-sm font-mono text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700">
        {text}
      </pre>
    </div>
  );
};

const GroupedCitation = ({ citations, open, onToggle }) => (
  <span className="relative">
    <button
      className="inline-flex items-center text-sm text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 transition-colors citation-popup"
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Quote size={16} />
      <span className="mr-1">تجميع الاستشهادات</span>
    </button>
    {open && <GroupedCitationPopup citations={citations} />}
  </span>
);

export default GroupedCitation;
