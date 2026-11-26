import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getAppMeta, getDb, setAppMeta } from '../db/database';
import {
  DARK_COLORS,
  DARK_SHADOWS,
  LIGHT_COLORS,
  LIGHT_SHADOWS,
  ResolvedTheme,
  resolveThemeMode,
  ThemeColors,
  ThemePreference,
  ThemeShadows,
} from '../theme/tokens';

export type { ThemePreference, ResolvedTheme };
export { resolveThemeMode };

const META_THEME_PREF = 'theme_preference_v1';

function readStoredThemePreference(): ThemePreference {
  try {
    getDb();
    const raw = getAppMeta(META_THEME_PREF);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
  } catch {
    // Fallback cleanly in tests or before DB init
  }
  return 'system';
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  colors: ThemeColors;
  shadows: ThemeShadows;
  setThemePreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  resolvedTheme: 'light',
  isDark: false,
  colors: LIGHT_COLORS,
  shadows: LIGHT_SHADOWS,
  setThemePreference: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredThemePreference()
  );

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      getDb();
      setAppMeta(META_THEME_PREF, next);
    } catch {
      // Non-fatal persistence failure
    }
  }, []);

  const resolvedTheme = resolveThemeMode(preference, systemScheme);
  const isDark = resolvedTheme === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      isDark,
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
      shadows: isDark ? DARK_SHADOWS : LIGHT_SHADOWS,
      setThemePreference,
    }),
    [preference, resolvedTheme, isDark, setThemePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Memoizes StyleSheet creation against the active theme palette so switching
 * between Light, Dark, and System updates every screen instantaneously.
 */
export function useThemedStyles<T>(
  factory: (colors: ThemeColors, shadows: ThemeShadows, isDark: boolean) => T
): T {
  const { colors, shadows, isDark } = useTheme();
  return useMemo(() => factory(colors, shadows, isDark), [factory, colors, shadows, isDark]);
}
