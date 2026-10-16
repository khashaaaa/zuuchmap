// Locale metadata with NO locale tree imports. The root barrel re-exports this
// file, not ./index.ts, so a client that imports `@zuuchmap/core` does not
// statically pull every translation tree into its main bundle (Rollup inlines a
// dynamically imported module that is also statically reachable).
import type { TranslationTree } from './types.js';

export type { TranslationTree } from './types.js';

export const LOCALES = ['mn', 'en', 'zh', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'mn';

export const isLocale = (v: unknown): v is Locale =>
  typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** Flatten a tree to dotted keys (`a.b.c`). Pure; used by tests and tooling. */
export function flattenTranslations(tree: TranslationTree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flattenTranslations(v, key));
  }
  return out;
}
