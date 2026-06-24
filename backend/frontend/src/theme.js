// src/theme.js
// Centralised colour-scheme handling. Preference is one of:
//   'auto'  – follow the operating system (prefers-color-scheme)
//   'light' – always light
//   'dark'  – always dark
// The active scheme is reflected by toggling the `dark` class on <html>,
// which drives every Tailwind `dark:` utility (darkMode: 'class').
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';
const VALID = ['auto', 'light', 'dark'];

export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (VALID.includes(saved)) return saved;
    // Migrate the legacy boolean key used by the old binary toggle.
    const legacy = localStorage.getItem('darkMode');
    if (legacy === 'true') return 'dark';
    if (legacy === 'false') return 'light';
  } catch {
    /* localStorage may be unavailable (private mode, etc.) */
  }
  return 'auto';
}

export function applyTheme(theme) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'auto' && systemDark);
  document.documentElement.classList.toggle('dark', isDark);
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme);

  // Reflect the preference on <html> whenever it changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // In auto mode, react to OS-level scheme changes live.
  useEffect(() => {
    if (theme !== 'auto') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('auto');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failures */
    }
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
