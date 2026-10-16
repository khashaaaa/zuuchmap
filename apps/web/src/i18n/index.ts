import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, isLocale } from '@zuuchmap/core';
import en from '@zuuchmap/core/i18n/en';
import mn from '@zuuchmap/core/i18n/mn';
import { ui } from './ui';

// mn and en are eager; zh and ru load on first switch. Web-only strings live under `ui.*`, in every locale.
void i18n.use(initReactI18next).init({
  resources: {
    mn: { translation: { ...mn, ui: ui.mn } },
    en: { translation: { ...en, ui: ui.en } },
  },
  partialBundledLanguages: true,
  lng: DEFAULT_LOCALE,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

const setHtmlLang = (lng: string) => {
  document.documentElement.lang = lng;
};
setHtmlLang(DEFAULT_LOCALE);

i18n.on('languageChanged', (lng) => {
  setHtmlLang(lng);
  if ((lng === 'zh' || lng === 'ru') && !i18n.hasResourceBundle(lng, 'translation')) {
    const load = lng === 'zh' ? import('@zuuchmap/core/i18n/zh') : import('@zuuchmap/core/i18n/ru');
    void load.then((m) => {
      i18n.addResourceBundle(lng, 'translation', { ...m.default, ui: ui[lng] });
      if (isLocale(lng) && i18n.language === lng) void i18n.changeLanguage(lng);
    });
  }
});

export default i18n;
