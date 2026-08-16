import { useColorScheme } from 'react-native';
import { useAppContext } from '../context/AppContext';
import { palettes, createGlobalStyles } from '../design/theme';

/**
 * Returns theme-aware colors and global styles for the current themeMode.
 * `styles` replaces the old static `globalStyles` export — it is rebuilt
 * (memoized per palette) whenever the theme switches, so never import
 * styles from theme.js at module scope.
 */
export function useAppTheme() {
    const { themeMode } = useAppContext();
    const systemScheme = useColorScheme();
    const resolvedMode = themeMode === 'system' ? (systemScheme ?? 'dark') : themeMode;
    const isDark = resolvedMode === 'dark';

    const colors = isDark ? palettes.dark : palettes.light;
    const styles = createGlobalStyles(colors);

    return { colors, styles, isDark, themeMode };
}

export default useAppTheme;
