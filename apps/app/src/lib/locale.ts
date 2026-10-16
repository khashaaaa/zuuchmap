import AsyncStorage from '@react-native-async-storage/async-storage';
import { isLocale, type Locale } from '@zuuchmap/core';
import i18n from '../i18n';
import { syncLocale } from './push';

const KEY = 'zm_locale';

export async function loadLocale(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (isLocale(v) && v !== i18n.language) await i18n.changeLanguage(v);
  } catch {
    /* keep the default */
  }
}

export async function setLocale(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
  AsyncStorage.setItem(KEY, locale).catch(() => undefined);
  void syncLocale(locale);
}
