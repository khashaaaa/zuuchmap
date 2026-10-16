import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BrowseSort, ListingListItem, SavedSearchParams } from '@zuuchmap/core';
import { formatRelativeAge } from '@zuuchmap/core';
import type { TFunction } from 'i18next';

/** The search state both Browse and its pushed pickers share: what/where/when, filters, sort, view. */
export interface BrowseState {
  q: string;
  family?: string;
  category?: string;
  subcategory?: string;
  province?: string;
  district?: string;
  date_from?: string;
  date_to?: string;
  price_min?: number;
  price_max?: number;
  price_unit?: string;
  /** `attr.<key>` filters, keyed without the prefix (`year_min`, `with_operator`). */
  attrs: Record<string, string>;
  sort: BrowseSort;
  view: 'list' | 'map';
}

const INITIAL_BROWSE: BrowseState = { q: '', attrs: {}, sort: 'relevance', view: 'list' };

let state: BrowseState = INITIAL_BROWSE;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getBrowse = (): BrowseState => state;
export const setBrowse = (patch: Partial<BrowseState>): void => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const useBrowseState = (): BrowseState => useSyncExternalStore(subscribe, getBrowse, getBrowse);

/** Everything `GET /posts` and `GET /posts/map` take from the state (price needs its unit, as the engine requires). */
export function browseParams(s: BrowseState): Record<string, string | number | undefined> {
  const p: Record<string, string | number | undefined> = {
    q: s.q.trim() || undefined,
    family: s.family,
    category: s.category,
    subcategory: s.subcategory,
    province: s.province,
    district: s.district,
    date_from: s.date_from,
    date_to: s.date_to,
    sort: s.sort === 'relevance' ? undefined : s.sort,
  };
  if (s.price_unit) {
    p.price_unit = s.price_unit;
    p.price_min = s.price_min;
    p.price_max = s.price_max;
  }
  for (const [k, v] of Object.entries(s.attrs)) if (v !== '') p[`attr.${k}`] = v;
  return p;
}

/** Filters set inside the A4 sheet (the badge on the filter button). */
export const sheetFilterCount = (s: BrowseState): number =>
  (s.subcategory ? 1 : 0) + (s.price_unit ? 1 : 0) + Object.values(s.attrs).filter((v) => v !== '').length + (s.sort !== 'relevance' ? 1 : 0);

export const hasSearch = (s: BrowseState): boolean =>
  !!(s.q.trim() || s.family || s.category || s.subcategory || s.province || s.date_from || s.price_unit || Object.keys(s.attrs).length);

export function toSavedParams(s: BrowseState): SavedSearchParams {
  const out: SavedSearchParams = {};
  if (s.q.trim()) out.q = s.q.trim();
  if (s.family) out.family = s.family;
  if (s.category) out.category = s.category;
  if (s.subcategory) out.subcategory = s.subcategory;
  if (s.province) out.province = s.province;
  if (s.district) out.district = s.district;
  if (s.price_unit) {
    out.price_unit = s.price_unit;
    if (s.price_min !== undefined) out.price_min = s.price_min;
    if (s.price_max !== undefined) out.price_max = s.price_max;
  }
  const attrs = Object.fromEntries(Object.entries(s.attrs).filter(([, v]) => v !== ''));
  if (Object.keys(attrs).length) out.attrs = attrs;
  return out;
}

export function fromSavedParams(p: SavedSearchParams): BrowseState {
  return {
    ...INITIAL_BROWSE,
    q: p.q ?? '',
    family: p.family,
    category: p.category,
    subcategory: p.subcategory,
    province: p.province,
    district: p.district,
    price_min: p.price_min,
    price_max: p.price_max,
    price_unit: p.price_unit,
    attrs: p.attrs ?? {},
    view: state.view,
  };
}

/** "Хан-Уул" for a district, else the province name; null when the listing has neither. */
export function placeLabel(t: TFunction, province?: string | null, district?: string | null): string | null {
  if (district) return t(`district.${district}`, { defaultValue: district });
  if (province) return t(`province.${province}`, { defaultValue: province });
  return null;
}

/** "Хан-Уул · 2 цагийн өмнө" for a list row. */
export function listingMeta(t: TFunction, item: ListingListItem, extra?: string | null): string {
  return [placeLabel(t, item.province, item.district), extra ?? formatRelativeAge(item.date_created, (k, o) => t(k, o) as string)].filter(Boolean).join(' · ');
}

// ---- Recent searches (A5), on the device ----

const RECENT_KEY = 'zm_recent';
let recent: string[] = [];
const recentListeners = new Set<() => void>();
const subscribeRecent = (l: () => void) => {
  recentListeners.add(l);
  return () => {
    recentListeners.delete(l);
  };
};
export async function loadRecent(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    if (raw) {
      recent = JSON.parse(raw) as string[];
      recentListeners.forEach((l) => l());
    }
  } catch {
    /* none */
  }
}
export function addRecent(q: string): void {
  const v = q.trim();
  if (!v) return;
  recent = [v, ...recent.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, 5);
  recentListeners.forEach((l) => l());
  AsyncStorage.setItem(RECENT_KEY, JSON.stringify(recent)).catch(() => undefined);
}
export const useRecent = (): string[] => useSyncExternalStore(subscribeRecent, () => recent, () => recent);
