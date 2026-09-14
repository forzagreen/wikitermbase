// src/components/MaziniTryIt.jsx
//
// Inline "try it" widget for mazini: root + وزن → the six headline forms.
// The library (~90 KB, no data files) is imported lazily on first use so the
// tools page itself stays light.
import { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';

// The slots worth showing at a glance; the demo has the full 119-slot table.
const HEADLINE_SLOTS = [
  ['past_3ms', 'الماضي'],
  ['ind_3ms', 'المضارع'],
  ['imp_2ms', 'الأمر'],
  ['vn', 'المصدر'],
  ['ap', 'اسم الفاعل'],
  ['pp', 'اسم المفعول'],
];

// MaziniError codes are stable; messages are English, so we translate here.
const ERROR_MESSAGES = {
  bad_root: 'الجذر لا يناسب هذا الوزن: تحقّق من عدد حروفه (ثلاثة أو أربعة)',
  invalid_radicals: 'حروف الجذر غير صالحة',
  unknown_wazn: 'وزن غير معروف',
  unsupported_weakness: 'هذا النوع من الجذور غير مدعوم بعد',
  reduced_not_applicable: 'الإدغام لا ينطبق على هذا الوزن',
};

const DEFAULT_ROOT = 'كتب';
const DEFAULT_WAZN = 'فعَل يفعُل';

const MaziniTryIt = () => {
  const [mazini, setMazini] = useState(null);
  const [loading, setLoading] = useState(false);
  const [root, setRoot] = useState(DEFAULT_ROOT);
  const [wazn, setWazn] = useState(DEFAULT_WAZN);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const conjugateWith = (lib, r, w) => {
    try {
      setResult(lib.conjugate(r, w));
      setError(null);
    } catch (err) {
      setResult(null);
      setError(ERROR_MESSAGES[err?.code] || 'تعذّر التصريف');
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const lib = await import('mazini');
      setMazini(lib);
      conjugateWith(lib, root, wazn);
    } catch {
      setError('تعذّر تحميل المازني');
    } finally {
      setLoading(false);
    }
  };

  const onRoot = (e) => {
    setRoot(e.target.value);
    if (mazini) conjugateWith(mazini, e.target.value, wazn);
  };
  const onWazn = (e) => {
    setWazn(e.target.value);
    if (mazini) conjugateWith(mazini, root, e.target.value);
  };

  if (!mazini) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm px-3 py-1.5 transition-colors"
      >
        <Play size={14} />
        {loading ? 'جارٍ التحميل…' : 'جرّب التصريف هنا'}
      </button>
    );
  }

  const inputClasses =
    'rounded-md border px-2 py-1 text-sm bg-white border-gray-300 text-gray-900 ' +
    'dark:bg-gray-800 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent';

  return (
    <div className="rounded-md border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          الجذر{' '}
          <input
            type="text"
            value={root}
            onChange={onRoot}
            className={`${inputClasses} w-24`}
            dir="rtl"
            aria-label="الجذر"
          />
        </label>
        <label className="text-sm">
          الوزن{' '}
          <select value={wazn} onChange={onWazn} className={inputClasses} aria-label="الوزن">
            {mazini.WAZNS.map((w) => (
              <option key={w.formCode} value={w.wazn}>
                {w.wazn}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{result.verbType}</p>
          <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
            {HEADLINE_SLOTS.map(([slot, label]) => {
              const forms = result.slots[slot];
              if (!forms || forms.length === 0) return null;
              return (
                <div key={slot} className="flex flex-col">
                  <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="font-semibold text-lg leading-snug">
                    {forms.map((f) => f.form).join(' / ')}
                  </dd>
                </div>
              );
            })}
          </dl>
          <a
            href="https://forzagreen.github.io/mazini-js/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"
          >
            <ExternalLink size={12} />
            الجدول الكامل (119 صيغة) في موقع المازني
          </a>
        </>
      )}
    </div>
  );
};

export default MaziniTryIt;
