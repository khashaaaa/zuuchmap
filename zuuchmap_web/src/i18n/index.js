import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import mn from './mn'
import en from './en'

export const LANGUAGES = [
  { code: 'mn', label: 'Монгол', flag: '🇲🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
]

const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('zm_lang')) || 'mn'
// zh/ru were retired — anyone still holding that preference falls back to mn.
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
})

export default i18n
