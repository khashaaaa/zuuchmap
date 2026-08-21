import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import mn from './locales/mn'
import en from './locales/en'

export const LANGUAGES = [
  { code: 'mn', label: 'Монгол', flag: '🇲🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
]

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        mn: { translation: mn },
        en: { translation: en },
      },
      lng: 'mn',
      fallbackLng: 'mn',
      interpolation: { escapeValue: false },
    })
}

export default i18n
