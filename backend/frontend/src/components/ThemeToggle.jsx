// src/components/ThemeToggle.jsx
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme';

const OPTIONS = [
  { value: 'light', icon: Sun, label: 'الوضع الفاتح' },
  { value: 'auto', icon: Monitor, label: 'تلقائي حسب النظام' },
  { value: 'dark', icon: Moon, label: 'الوضع الداكن' },
];

const ThemeToggle = () => {
  const [theme, setTheme] = useTheme();

  return (
    <div
      role="group"
      aria-label="اختيار سمة العرض"
      className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${
              active
                ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-600 dark:text-blue-300'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
