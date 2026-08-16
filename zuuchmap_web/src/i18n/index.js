import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import mn from './mn'
import en from './en'
import zh from './zh'
import ru from './ru'

export const LANGUAGES = [
  { code: 'mn', label: 'Монгол', flag: '🇲🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
]

const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('zm_lang')) || 'mn'

i18n.use(initReactI18next).init({
  resources: {
    mn: { translation: mn },
    en: { translation: en },
    zh: { translation: zh },
    ru: { translation: ru },
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
