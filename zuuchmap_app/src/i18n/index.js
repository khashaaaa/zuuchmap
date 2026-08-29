import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import mn from './locales/mn'
import en from './locales/en'
import zh from './locales/zh'
import ru from './locales/ru'

export const LANGUAGES = [
  { code: 'mn', label: 'Монгол', flag: '🇲🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
]

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        mn: { translation: mn },
        en: { translation: en },
        zh: { translation: zh },
        ru: { translation: ru },
      },
      lng: 'mn',
      fallbackLng: 'mn',
      interpolation: { escapeValue: false },
    })
}

export default i18n
