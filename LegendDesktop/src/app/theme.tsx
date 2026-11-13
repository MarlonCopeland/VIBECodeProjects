// src/app/theme.tsx
// Appearance preference (system / light / dark), persisted under the same
// key the phone app uses. Applies `data-theme` on <html>; theme.css does the
// rest. `resolved` is what's actually showing — the 3D map reads it.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '@legend/lib/storage';

export type ColorSchemePreference = 'system' | 'light' | 'dark';

const PREF_KEY = 'unjaded.theme.preference';

interface ThemeValue {
  preference: ColorSchemePreference;
  setPreference(pref: ColorSchemePreference): void;
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeValue | null>(null);

const media = window.matchMedia('(prefers-color-scheme: light)');

export function DesktopThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ColorSchemePreference>('system');
  const [osLight, setOsLight] = useState(media.matches);

  useEffect(() => {
    void storage.getItem(PREF_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setPreferenceState(saved);
    });
    const onChange = () => setOsLight(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (preference === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = preference;
  }, [preference]);

  const setPreference = useCallback((pref: ColorSchemePreference) => {
    setPreferenceState(pref);
    void storage.setItem(PREF_KEY, pref);
  }, []);

  const resolved: 'light' | 'dark' = preference === 'system' ? (osLight ? 'light' : 'dark') : preference;
  const value = useMemo(() => ({ preference, setPreference, resolved }), [preference, setPreference, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useDesktopTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useDesktopTheme must be used inside DesktopThemeProvider');
  return ctx;
}
