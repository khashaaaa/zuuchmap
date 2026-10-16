import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type TextStyle, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dark, light, motion, radius, spacing, type as typeTokens, elevation as elevationTokens } from '@zuuchmap/tokens';
import type { Colors, TypeRole } from '@zuuchmap/tokens';

export type Scheme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'zm_theme';

/** Type roles as RN text styles. The face already carries the weight, so no fontWeight (Android would synthesise). */
export type TypeStyles = Record<TypeRole, TextStyle>;
const typeStyles = Object.fromEntries(
  Object.entries(typeTokens).map(([role, v]) => [
    role,
    { fontFamily: v.fontFamily, fontSize: v.fontSize, lineHeight: v.lineHeight, letterSpacing: v.letterSpacing },
  ]),
) as TypeStyles;

/** Light separates with a shadow, dark with a 1 px hairline. Spread FIRST in a style. */
export type Elevation = Record<'sm' | 'md' | 'lg', ViewStyle>;
const lightElevation: Elevation = {
  sm: { ...elevationTokens.sm },
  md: { ...elevationTokens.md },
  lg: { ...elevationTokens.lg },
};
const darkElevation: Elevation = {
  sm: { borderWidth: 1, borderColor: dark.borderElevation },
  md: { borderWidth: 1, borderColor: dark.borderElevation },
  lg: { borderWidth: 1, borderColor: dark.borderElevation },
};

export interface AppTheme {
  colors: Colors;
  scheme: Scheme;
  isDark: boolean;
  type: TypeStyles;
  spacing: typeof spacing;
  radius: typeof radius;
  motion: typeof motion;
  elevation: Elevation;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  // The repaint follows the choice one slide later: restyling every screen stalls the JS thread, and a
  // commit mid-animation would snap the picker's sliding pill.
  const [applied, setApplied] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') {
          setModeState(v);
          setApplied(v);
        }
      })
      .catch(() => undefined);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setTimeout(() => setApplied(next), motion.durationNormal);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const scheme: Scheme = applied === 'system' ? (system === 'dark' ? 'dark' : 'light') : applied;

  const value = useMemo<AppTheme>(
    () => ({
      colors: scheme === 'dark' ? dark : light,
      scheme,
      isDark: scheme === 'dark',
      type: typeStyles,
      spacing,
      radius,
      motion,
      elevation: scheme === 'dark' ? darkElevation : lightElevation,
      mode,
      setMode,
    }),
    [scheme, mode, setMode],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useAppTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used inside ThemeProvider');
  return ctx;
}

type Styles = { [key: string]: ViewStyle | TextStyle };

/** `const useStyles = themedStyles((t) => ({ box: { backgroundColor: t.colors.bgSurface } }))`, then `const s = useStyles()`. */
export function themedStyles<T extends Styles>(factory: (t: AppTheme) => T): () => { [K in keyof T]: T[K] } {
  return function useThemedStyles() {
    const t = useAppTheme();
    return useMemo(() => StyleSheet.create(factory(t)) as { [K in keyof T]: T[K] }, [t]);
  };
}
