// Full i18n surface: every locale tree plus `resources` for i18next. Importing
// this (or the root barrel's `resources`) bundles all four locales — a client
// that wants to lazy-load locales imports `@zuuchmap/core/i18n/<locale>` and
// the metadata from the root barrel instead.
import { en } from './en.js';
import { mn } from './mn.js';
import { ru } from './ru.js';
import { zh } from './zh.js';
import { DEFAULT_LOCALE, flattenTranslations, type Locale, type TranslationTree } from './meta.js';

export * from './meta.js';
export { en, mn, ru, zh };

/** Shaped for `i18next.init({ resources })`. */
export const resources: Record<Locale, { translation: TranslationTree }> = {
  mn: { translation: mn },
  en: { translation: en },
  zh: { translation: zh },
  ru: { translation: ru },
};

const flatCache = new Map<Locale, Record<string, string>>();
const flat = (locale: Locale): Record<string, string> => {
  let f = flatCache.get(locale);
  if (!f) {
    f = flattenTranslations(resources[locale].translation);
    flatCache.set(locale, f);
  }
  return f;
};

/**
 * A minimal i18next-compatible `t` for code that runs without i18next (the engine's push and
 * e-mail copy): dotted keys, `{{name}}` interpolation, falling back to `mn`, then to the key.
 * No plural suffixes — strings rendered through it are written without them.
 */
export function translator(locale: Locale): (key: string, options?: Record<string, unknown>) => string {
  return (key, options) => {
    const raw = flat(locale)[key] ?? flat(DEFAULT_LOCALE)[key] ?? key;
    return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
      const v = options?.[name];
      return v === undefined || v === null ? '' : String(v);
    });
  };
}
