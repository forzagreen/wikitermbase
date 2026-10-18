// src/settings.js
//
// The visitor's settings (the ⚙ panel in the header, SettingsPanel.jsx):
// one JSON object in localStorage, read once, shared by every component
// through useSettings(). Nothing is sent anywhere. The colour scheme has its
// own key and hook (theme.js), from before this panel existed.
import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'settings';

export const DEFAULT_SETTINGS = {
  // «تحليل صرفي» under every result group (MorphologySection.jsx). Off by
  // default: it is a specialist's view and costs one request per group.
  morphology: false,
};

const read = () => {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

let current = read();
const listeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => current;

// [settings, update]; update({ key: value }) merges, saves and re-renders
// every subscriber.
export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const update = useCallback((patch) => {
    current = { ...current, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* private mode etc.: the setting still applies to this page */
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [settings, update];
}
