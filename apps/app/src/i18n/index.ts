import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALES } from '@zuuchmap/core';
import { resources } from '@zuuchmap/core/i18n';
import { extra } from './extra';

export { LOCALES };

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

for (const lng of LOCALES) i18n.addResourceBundle(lng, 'translation', extra[lng], true, false);

export default i18n;
