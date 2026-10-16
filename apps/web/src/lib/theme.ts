import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'zm_theme';
const CANVAS = { light: '#F3F5F8', dark: '#0E1726' } as const;

const isDarkNow = (t: Theme): boolean =>
  t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

function apply(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDarkNow(t) ? CANVAS.dark : CANVAS.light);
}

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme, persist?: boolean) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: read(),
  setTheme: (t, persist = true) => {
    // A cross-fade where the browser has view transitions (reduced motion: the CSS turns it off).
    if (persist && document.startViewTransition && isDarkNow(t) !== isDarkNow(useThemeStore.getState().theme)) document.startViewTransition(() => apply(t));
    else apply(t);
    if (persist) {
      try {
        if (t === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, t);
      } catch {
        /* storage unavailable */
      }
    }
    set({ theme: t });
  },
}));

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const { theme } = useThemeStore.getState();
  if (theme === 'system') apply('system');
});
