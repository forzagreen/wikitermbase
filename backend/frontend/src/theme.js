// src/theme.js
// Centralised colour-scheme handling. Preference is one of:
//   'auto'  – follow the operating system (prefers-color-scheme)
//   'light' – always light
//   'dark'  – always dark
// The active scheme is reflected by toggling the `dark` class on <html>,
// which drives every Tailwind `dark:` utility (darkMode: 'class').
//
// The preference is applied, and the OS scheme watched, from this module's
// load on, not from a component: index.html applies the saved preference
// before first paint, but a browser can still change its reported scheme
// right after (a fresh Chrome private window first reports dark, then the OS
// value), and that must be followed on pages that do not mount the toggle.
import { useCallback, useSyncExternalStore } from 'react';

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

const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(theme) {
  const isDark = theme === 'dark' || (theme === 'auto' && systemDarkQuery.matches);
  document.documentElement.classList.toggle('dark', isDark);
}

let current = getStoredTheme();
const listeners = new Set();

applyTheme(current);
// In auto mode, follow OS-level scheme changes live.
systemDarkQuery.addEventListener('change', () => {
  if (current === 'auto') applyTheme('auto');
});

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => current;

// [theme, setTheme]; every toggle on the page shares the one preference.
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setTheme = useCallback((next) => {
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failures */
    }
    applyTheme(next);
    listeners.forEach((listener) => listener());
  }, []);
  return [theme, setTheme];
}
