import { useTranslation } from 'react-i18next';
import type { Locale } from '@zuuchmap/core';

/** The active UI locale, for the core formatters. */
export function useLocale(): Locale {
  return useTranslation().i18n.language as Locale;
}
