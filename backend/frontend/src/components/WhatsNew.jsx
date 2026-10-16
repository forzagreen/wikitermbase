// src/components/WhatsNew.jsx
//
// The «الجديد» button of the site header and its panel. The panel opens by
// itself, once, when there is news the visitor has not seen yet (a dot on the
// button says so too), and on demand from the button at any time. The close
// button, Esc and a click anywhere else close it and mark the news seen. What
// counts as news, and how "seen" is remembered, is in ../whatsNew.js.
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Sparkles, X } from 'lucide-react';
import { FEATURES, useWhatsNew } from '../whatsNew';

// "أكتوبر 2026": Arabic month name, Western digits like the rest of the site.
const formatMonth = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('ar-u-nu-latn', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, day)
  );
};

// Arabic count agreement for the heading of the dictionaries block.
const addedDictsLabel = (count) => {
  if (count === 1) return 'أُضيف معجم جديد';
  if (count === 2) return 'أُضيف معجمان جديدان';
  if (count <= 10) return `أُضيفت ${count} معاجم جديدة`;
  return `أُضيف ${count} معجمًا جديدًا`;
};

// Names listed before "and N more".
const MAX_LISTED_DICTS = 5;

const WhatsNew = () => {
  const { open, openedBy, show, close, hasUnseen, unseenFeatures, newDicts } = useWhatsNew();
  const rootRef = useRef(null);
  const closeRef = useRef(null);

  // Click outside and Esc close the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) close();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // Opened from the button, the panel takes the focus (keyboard users). The
  // auto-open leaves it where it is: on the home page that is the search box.
  useEffect(() => {
    if (open && openedBy === 'button') closeRef.current?.focus();
  }, [open, openedBy]);

  // Opened by itself the panel shows only the news; opened by the visitor it
  // shows the whole (short) list, so earlier entries can be read again.
  const features = openedBy === 'button' ? FEATURES : unseenFeatures;
  const listedDicts = newDicts.slice(0, MAX_LISTED_DICTS);
  const moreDicts = newDicts.length - listedDicts.length;

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={open ? close : show}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="ما الجديد في مسرد الويكي؟"
        className={`relative flex items-center gap-1.5 rounded-full px-2 sm:px-3 py-2 text-sm font-medium transition-colors ${
          open
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'
            : 'text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        <Sparkles size={22} />
        <span className="hidden sm:inline">الجديد</span>
        {hasUnseen && (
          <span
            className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-800"
            aria-hidden="true"
          />
        )}
        {hasUnseen && <span className="sr-only">(يوجد جديد)</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="ما الجديد؟"
          className="fixed inset-x-3 bottom-3 z-20 max-h-[80vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-right shadow-lg dark:border-gray-700 dark:bg-gray-800 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <Sparkles size={18} className="text-blue-500" />
              ما الجديد؟
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="إغلاق"
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>
          </div>

          {newDicts.length > 0 && (
            <section className="mb-3 border-b border-gray-100 pb-3 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">{addedDictsLabel(newDicts.length)}</h3>
              <ul className="mt-1.5 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                {listedDicts.map((d) => (
                  <li key={d.id}>
                    {d.arabterm_url ? (
                      <a
                        href={d.arabterm_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                        title="تصفّح المعجم في موقع arabterm"
                      >
                        {d.name_arabic}
                      </a>
                    ) : (
                      d.name_arabic
                    )}
                  </li>
                ))}
                {moreDicts > 0 && (
                  <li>
                    <Link to="/dictionaries" onClick={close} className="text-blue-600 hover:underline dark:text-blue-400">
                      و{moreDicts} {moreDicts <= 10 ? 'معاجم أخرى' : 'معجمًا آخر'}…
                    </Link>
                  </li>
                )}
              </ul>
            </section>
          )}

          <div>
            {features.map((f) => (
              <section
                key={f.id}
                className="mt-3 border-t border-gray-100 pt-3 first:mt-0 first:border-t-0 first:pt-0 dark:border-gray-700"
              >
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">{f.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatMonth(f.date)}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{f.body}</p>
                {f.Media && <f.Media />}
              </section>
            ))}
          </div>

          {newDicts.length === 0 && (
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              المعاجم المضافة مؤخرًا تجدها في أعلى{' '}
              <Link to="/dictionaries" onClick={close} className="text-blue-600 hover:underline dark:text-blue-400">
                قائمة المعاجم
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default WhatsNew;
