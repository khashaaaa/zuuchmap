import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import mn from './mn'
import en from './en'

/**
 * The languages the WEB INTERFACE is offered in.
 *
 * The app ships four (mn/en/zh/ru); the web ships two. That asymmetry is
 * deliberate — a browser visitor who reads neither Mongolian nor English is
 * far rarer than an app user who does, and every extra tree is another place
 * for a string to rot unnoticed. `check:sync` knows about the split and only
 * compares the overlap across the two clients.
 *
 * This list drives the header switcher. It does NOT drive the category label
 * editor — see SCHEMA_LOCALES.
 */
export const LANGUAGES = [
  { code: 'mn', label: 'Монгол', flag: '🇲🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
]

/**
 * The locales a CategorySchema carries labels for.
 *
 * Deliberately NOT `LANGUAGES`. The web admin is the only place these labels
 * can be edited, but the app renders all four — so narrowing the web UI to
 * mn/en must not narrow what an admin can type. Tie these together again and
 * zh/ru category names silently decay to the raw key on every app screen that
 * shows one, with nothing to notice it.
 *
 * Mirrors the `{mn,en,zh,ru}` shape of CategorySchema.labels in the engine.
 */
export const SCHEMA_LOCALES = ['mn', 'en', 'zh', 'ru']

/** Human labels for SCHEMA_LOCALES, for the two the header no longer names. */
export const SCHEMA_LOCALE_LABELS = {
  mn: 'Монгол',
  en: 'English',
  zh: '中文',
  ru: 'Русский',
}

const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('zm_lang')) || 'mn'
// An unknown stored code (a retired locale, a typo) falls back to mn. This is
// also the path a visitor takes who had picked zh or ru before the web dropped
// them — they land on Mongolian rather than a blank UI.
const saved = LANGUAGES.some((l) => l.code === stored) ? stored : 'mn'

i18n.use(initReactI18next).init({
  resources: {
    mn: { translation: mn },
    en: { translation: en },
  },
  lng: saved,
  fallbackLng: 'mn',
  interpolation: { escapeValue: false },
  initImmediate: false,
})

i18n.on('languageChanged', (lng) => {
  try { localStorage.setItem('zm_lang', lng) } catch { /* noop */ }
  // index.html ships lang="mn"; keep the document honest for screen readers
  // and crawlers when the UI is switched.
  if (typeof document !== 'undefined') document.documentElement.lang = lng
})
if (typeof document !== 'undefined') document.documentElement.lang = i18n.language || stored

export default i18n
