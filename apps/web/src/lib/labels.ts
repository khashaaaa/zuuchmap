import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryView } from '@zuuchmap/core';
import { useCategories } from './queries';

/** "Хан-Уул" (district first, else the province); empty when neither is set. */
export function usePlace(): (province?: string | null, district?: string | null) => string {
  const { t, i18n } = useTranslation();
  return (province, district) => {
    const has = (k: string) => i18n.exists(k);
    if (district && has(`district.${district}`)) return t(`district.${district}`);
    if (province && has(`province.${province}`)) return t(`province.${province}`);
    return '';
  };
}

export function useCategoryLookup() {
  const q = useCategories();
  return useMemo(() => {
    const list = q.data ?? [];
    return { list, byKey: new Map<string, CategoryView>(list.map((c) => [c.key, c])), loading: q.isLoading };
  }, [q.data, q.isLoading]);
}

const camel = (s: string) => s.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** A select option (`WEEKDAY_DAY`) through the `attrs.*` strings; unknown values show as written. */
export function useOptionLabel(): (value: string) => string {
  const { t, i18n } = useTranslation();
  return (value) => {
    const k = camel(value);
    for (const key of [`attrs.${k}`, `attrs.coverage${k[0]?.toUpperCase() ?? ''}${k.slice(1)}`]) if (i18n.exists(key)) return t(key);
    return value;
  };
}
