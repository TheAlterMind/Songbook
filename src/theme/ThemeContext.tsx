import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInterfaceScale } from './scale';
import { ACCENT_OPTIONS, Colors, darkColors, lightColors, RADIUS } from './tokens';

const SETTINGS_KEY = 'lyrics_library_settings_v1';

export type Theme = 'system' | 'light' | 'dark';

export type Settings = {
  accentColor: string;
  /** What the person chose. */
  theme: Theme;
  /** Whether the light palette is in use right now (follows the system when theme is 'system'). Derived, not saved. */
  lightMode: boolean;
  /** A value from FONT_CHOICES. */
  font: string;
  /** Keep the screen on while a song is open. */
  keepAwake: boolean;
  defaultFontSize: number;
  defaultChordsOn: boolean;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  viewMode: 'expanded' | 'compact';
  /** Interface size multiplier (web): 0.85, 1, 1.25 or 1.5, as in Sitness. */
  uiScale: number;
};

const DEFAULT_SETTINGS: Settings = {
  accentColor: ACCENT_OPTIONS[0].value,
  theme: 'dark',
  lightMode: false,
  font: 'system',
  keepAwake: false,
  defaultFontSize: 19,
  defaultChordsOn: false,
  sortBy: 'title',
  sortDir: 'asc',
  viewMode: 'expanded',
  uiScale: 1,
};

type ThemeContextType = {
  colors: Colors;
  radius: typeof RADIUS;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Puts every setting back to its default. */
  resetSettings: () => void;
  loaded: boolean;
  /** Wide window: the app sits in a framed, centred column. */
  wide: boolean;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<Settings>(DEFAULT_SETTINGS);
  const system = useColorScheme();
  const [loaded, setLoaded] = useState(false);
  const { wide } = useInterfaceScale(stored.uiScale);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const saved = JSON.parse(raw);
            // Before the Theme choice there was a Light version switch: keep what it was set to.
            const theme: Theme = ['system', 'light', 'dark'].includes(saved.theme) ? saved.theme : saved.lightMode ? 'light' : 'dark';
            setStored({ ...DEFAULT_SETTINGS, ...saved, theme });
          } catch {
            // corrupt settings blob — fall back to defaults rather than crash
          }
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const updateSettings = (patch: Partial<Settings>) => {
    setStored((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const resetSettings = () => updateSettings({ ...DEFAULT_SETTINGS });

  const lightMode = stored.theme === 'system' ? system === 'light' : stored.theme === 'light';
  const settings = useMemo(() => ({ ...stored, lightMode }), [stored, lightMode]);

  // An accent saved before the palette changed falls back to the default.
  const accent = ACCENT_OPTIONS.some((o) => o.value === stored.accentColor)
    ? stored.accentColor
    : ACCENT_OPTIONS[0].value;
  const colors = useMemo(
    () => (lightMode ? lightColors(accent) : darkColors(accent)),
    [lightMode, accent]
  );

  return (
    <ThemeContext.Provider value={{ colors, radius: RADIUS, settings, updateSettings, resetSettings, loaded, wide }}>
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
