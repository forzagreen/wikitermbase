// src/components/SettingsPanel.jsx
//
// The ⚙ button of the site header and its panel: the colour scheme (moved
// here from the header) and the optional features. Settings live in the
// browser (settings.js / theme.js); the panel closes on Esc, on a click
// outside and from its close button, like the «الجديد» panel.
import { useEffect, useRef, useState } from 'react';
import { Settings, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useSettings } from '../settings';

const Switch = ({ id, checked, onChange }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    {/* RTL page: "on" sits on the left-hand end of the track. */}
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
        checked ? '-translate-x-5' : '-translate-x-0.5'
      }`}
    />
  </button>
);

const SettingsPanel = () => {
  const [open, setOpen] = useState(false);
  const [settings, update] = useSettings();
  const rootRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="الإعدادات"
        aria-label="الإعدادات"
        className={`flex items-center rounded-full p-2 transition-colors ${
          open
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'
            : 'text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        <Settings size={22} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="الإعدادات"
          className="fixed inset-x-3 bottom-3 z-20 max-h-[80vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-right shadow-lg dark:border-gray-700 dark:bg-gray-800 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <Settings size={18} className="text-blue-500" />
              الإعدادات
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>
          </div>

          <section className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">المظهر</span>
            <ThemeToggle />
          </section>

          <section className="border-b border-gray-100 py-3 dark:border-gray-700">
            <div className="flex items-start justify-between gap-3">
              <label htmlFor="setting-groups-expanded" className="text-sm font-medium text-gray-800 dark:text-gray-100">
                فتح مداخل المعاجم
              </label>
              <Switch
                id="setting-groups-expanded"
                checked={settings.groupsExpanded}
                onChange={(value) => update({ groupsExpanded: value })}
              />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              يعرض مداخل المعاجم تحت كل نتيجة مفتوحةً من البداية؛ وإلا تبقى مطويّة ويفتحها السهم عند الحاجة.
            </p>
          </section>

          <section className="pt-3">
            <div className="flex items-start justify-between gap-3">
              <label htmlFor="setting-morphology" className="text-sm font-medium text-gray-800 dark:text-gray-100">
                التحليل الصرفي والدلالي
              </label>
              <Switch
                id="setting-morphology"
                checked={settings.morphology}
                onChange={(value) => update({ morphology: value })}
              />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              يعرض تحت كل نتيجة جذر كلماتها العربية ووزنها، والأفعال المشتقة من الجذر ومعانيها المنشورة
              في ويكي بيانات. التحليل آلي (محلّل الفراهيدي) وقد يخطئ في الكلمات الدخيلة أو المشتركة.
            </p>
          </section>

          <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
            تُحفظ الإعدادات في هذا المتصفح فقط.
          </p>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
