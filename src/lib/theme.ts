'use client';

import { useCallback, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from './theme-script';

export type ThemePreference = 'system' | 'light' | 'dark';

export { THEME_STORAGE_KEY };

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** Current theme preference plus the theme actually shown. */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setPreferenceState(readPreference());
    setSystemDark(systemPrefersDark());
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage unavailable: the choice lasts for this page only
    }
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    window.dispatchEvent(new CustomEvent('geotracker:theme', { detail: next }));
  }, []);

  const resolved: 'light' | 'dark' = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  return { preference, resolved, setPreference };
}

/** The theme currently on screen, read from the DOM (for non-React code such as the map). */
export function currentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return systemPrefersDark() ? 'dark' : 'light';
}
