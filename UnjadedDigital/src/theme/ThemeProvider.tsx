// src/theme/ThemeProvider.tsx
// Theme context. Resolves the active color scheme from either the user's
// explicit preference (persisted) or the OS setting, and exposes tokens +
// semantic colors to the whole tree via `useTheme()`.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ThemeColors } from './colors';
import { fontSize, fontWeight, radius, spacing } from './tokens';
import { storage } from '../lib/storage';

export type ColorSchemePreference = 'system' | 'light' | 'dark';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
}

interface ThemeContextValue extends Theme {
  preference: ColorSchemePreference;
  setPreference: (pref: ColorSchemePreference) => void;
}

const PREF_KEY = 'unjaded.theme.preference';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const osScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ColorSchemePreference>('system');

  // Restore persisted preference.
  useEffect(() => {
    (async () => {
      const saved = (await storage.getItem(PREF_KEY)) as ColorSchemePreference | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setPreferenceState(saved);
      }
    })();
  }, []);

  const setPreference = useCallback((pref: ColorSchemePreference) => {
    setPreferenceState(pref);
    void storage.setItem(PREF_KEY, pref);
  }, []);

  const scheme: 'light' | 'dark' =
    preference === 'system' ? (osScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      spacing,
      radius,
      fontSize,
      fontWeight,
      preference,
      setPreference,
    }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
