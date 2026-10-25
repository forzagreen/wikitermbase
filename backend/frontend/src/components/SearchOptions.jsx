// src/components/SearchOptions.jsx
//
// The two optional features of the results page, as a row of switches right
// under the search box (they used to sit in a ⚙ panel of the header, where
// nobody found them). DictionaryApp mounts the row only while results are on
// screen, since both options only change how results are rendered; the row
// starts at the right, where an RTL reader's eye lands. Both are off by
// default and saved in the browser (settings.js). Each switch has an ⓘ button
// that shows its one-line hint; the hint closes on Esc, on a click outside
// and on a second click on ⓘ.
import { useEffect, useRef, useState } from 'react';
import { Info, ListTree } from 'lucide-react';
import FaalIcon from './FaalIcon';
import { useSettings } from '../settings';

// «فعل» (FaalIcon) is the glyph of the «تحليل صرفي» heading of a result
// group, so the switch and what it shows match; it is a tall glyph, hence
// its own size.
const OPTIONS = [
  {
    key: 'groupsExpanded',
    icon: ListTree,
    label: 'توسيع مداخل المعاجم',
    hint: 'تظهر مداخل المعاجم تحت كل نتيجة عند التفعيل، وإلا فتطوى في قائمة منسدلة.',
  },
  {
    key: 'morphology',
    icon: FaalIcon,
    label: 'التحليل الصرفي والدلالي',
    hint: 'إظهار تحليل الكلمة صرفيًا (محلل الفراهيدي) ودلاليًا (ويكي بيانات).',
  },
];

const Switch = ({ id, checked, onChange, labelledBy }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    {/* RTL page: "on" sits on the left-hand end of the track. */}
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? '-translate-x-4' : '-translate-x-0.5'
      }`}
    />
  </button>
);

const SearchOptions = () => {
  const [settings, update] = useSettings();
  // Key of the option whose hint is open, or null.
  const [openHint, setOpenHint] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!openHint) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpenHint(null);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpenHint(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openHint]);

  const shown = OPTIONS.find((o) => o.key === openHint);

  return (
    <div ref={rootRef} className="mt-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {OPTIONS.map(({ key, icon: Icon, label }) => {
          const checked = settings[key];
          const labelId = `search-option-${key}-label`;
          const hintOpen = openHint === key;
          return (
            <div
              key={key}
              className={`flex items-center gap-2 rounded-full border py-1 pr-2.5 pl-1.5 text-sm transition-colors ${
                checked
                  ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-100'
                  : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              <Icon
                size={15}
                className={`h-[17px] w-auto ${checked ? 'text-blue-500' : 'text-gray-400'}`}
                aria-hidden="true"
              />
              <label id={labelId} htmlFor={`search-option-${key}`} className="cursor-pointer select-none">
                {label}
              </label>
              <Switch
                id={`search-option-${key}`}
                labelledBy={labelId}
                checked={checked}
                onChange={(value) => update({ [key]: value })}
              />
              <button
                type="button"
                onClick={() => setOpenHint(hintOpen ? null : key)}
                aria-expanded={hintOpen}
                aria-controls="search-option-hint"
                aria-label={`شرح: ${label}`}
                title={`شرح: ${label}`}
                className={`rounded-full p-0.5 transition-colors ${
                  hintOpen
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-100'
                    : 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-300'
                }`}
              >
                <Info size={15} />
              </button>
            </div>
          );
        })}
      </div>
      {/* Under the pills, at the start (right) of the row like them, and no
          wider than its text, so it reads as coming from the ⓘ. */}
      {shown && (
        <div className="flex">
          <p
            id="search-option-hint"
            role="status"
            className="mt-2 max-w-lg rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900 dark:border-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
          >
            <span className="font-semibold">{shown.label}: </span>
            {shown.hint}
          </p>
        </div>
      )}
    </div>
  );
};

export default SearchOptions;
