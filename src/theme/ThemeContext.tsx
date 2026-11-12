import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInterfaceScale } from './scale';
import { ACCENT_OPTIONS, Colors, darkColors, lightColors, RADIUS } from './tokens';

const SETTINGS_KEY = 'lyrics_library_settings_v1';

export type Settings = {
  accentColor: string;
  lightMode: boolean;
  defaultFontSize: number;
  defaultChordsOn: boolean;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  viewMode: 'expanded' | 'compact';
};

const DEFAULT_SETTINGS: Settings = {
  accentColor: ACCENT_OPTIONS[0].value,
  lightMode: false,
  defaultFontSize: 19,
  defaultChordsOn: false,
  sortBy: 'title',
  sortDir: 'asc',
  viewMode: 'expanded',
};

type ThemeContextType = {
  colors: Colors;
  radius: typeof RADIUS;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  loaded: boolean;
  /** Wide window: the app sits in a framed, centred column. */
  wide: boolean;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const { wide } = useInterfaceScale();

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
          } catch {
            // corrupt settings blob — fall back to defaults rather than crash
          }
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  // An accent saved before the palette changed falls back to the default.
  const accent = ACCENT_OPTIONS.some((o) => o.value === settings.accentColor)
    ? settings.accentColor
    : ACCENT_OPTIONS[0].value;
  const colors = useMemo(
    () => (settings.lightMode ? lightColors(accent) : darkColors(accent)),
    [settings.lightMode, accent]
  );

  return (
    <ThemeContext.Provider value={{ colors, radius: RADIUS, settings, updateSettings, loaded, wide }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export { ACCENT_OPTIONS };
