import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BrowseSort, SavedSearchParams } from '@zuuchmap/core';

export interface SearchState {
  q?: string;
  family?: string;
  category?: string;
  subcategory?: string;
  province?: string;
  district?: string;
  date_from?: string;
  date_to?: string;
  price_min?: string;
  price_max?: string;
  price_unit?: string;
  /** `attr.<key>` filters keyed without the prefix (`_min`/`_max` kept). */
  attrs: Record<string, string>;
  sort?: BrowseSort;
  view: 'list' | 'map';
}

const PLAIN = ['q', 'family', 'category', 'subcategory', 'province', 'district', 'date_from', 'date_to', 'price_min', 'price_max', 'price_unit'] as const;
const SORTS: readonly string[] = ['relevance', 'newest', 'nearby', 'price_asc', 'price_desc'];

export function parseSearch(sp: URLSearchParams): SearchState {
  const s: SearchState = { attrs: {}, view: sp.get('view') === 'map' ? 'map' : 'list' };
  for (const k of PLAIN) {
    const v = sp.get(k);
    if (v) s[k] = v;
  }
  const sort = sp.get('sort');
  if (sort && SORTS.includes(sort)) s.sort = sort as BrowseSort;
  for (const [k, v] of sp.entries()) if (k.startsWith('attr.') && v) s.attrs[k.slice(5)] = v;
  if (!(s.date_from && s.date_to)) {
    delete s.date_from;
    delete s.date_to;
  }
  return s;
}

export function serializeSearch(s: SearchState): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of PLAIN) if (s[k]) p.set(k, s[k]);
  if (s.sort) p.set('sort', s.sort);
  for (const [k, v] of Object.entries(s.attrs)) if (v) p.set(`attr.${k}`, v);
  if (s.view === 'map') p.set('view', 'map');
  return p;
}

type Patch = Partial<Omit<SearchState, 'attrs'>> & { attrs?: Record<string, string> };

/** The browse filters live in the URL, so a link carries the search and Back undoes a change. */
export function useSearchState(): [SearchState, (patch: Patch, replace?: boolean) => void] {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parseSearch(sp), [sp]);
  const update = useCallback(
    (patch: Patch, replace = false) => {
      const next: SearchState = { ...state, attrs: { ...state.attrs }, ...patch };
      if (patch.attrs) next.attrs = patch.attrs;
      setSp(serializeSearch(next), { replace });
    },
    [state, setSp],
  );
  return [state, update];
}

export type ApiQuery = Record<string, string | number | undefined>;

/** `GET /posts` query for a search state; `geo` adds distances and enables `nearby`. */
export function searchToApi(s: SearchState, geo?: { lat: number; lng: number } | null): ApiQuery {
  const q: ApiQuery = {};
  for (const k of PLAIN) if (s[k]) q[k] = s[k];
  if (s.sort && (s.sort !== 'nearby' || geo)) q.sort = s.sort;
  for (const [k, v] of Object.entries(s.attrs)) if (v) q[`attr.${k}`] = v;
  if (geo) {
    q.lat = geo.lat;
    q.lng = geo.lng;
  }
  if (!s.price_min && !s.price_max) delete q.price_unit;
  return q;
}

export function searchToSaved(s: SearchState): SavedSearchParams {
  const p: SavedSearchParams = {};
  if (s.q) p.q = s.q;
  if (s.family) p.family = s.family;
  if (s.category) p.category = s.category;
  if (s.subcategory) p.subcategory = s.subcategory;
  if (s.province) p.province = s.province;
  if (s.district) p.district = s.district;
  if (s.price_min) p.price_min = Number(s.price_min);
  if (s.price_max) p.price_max = Number(s.price_max);
  if ((s.price_min || s.price_max) && s.price_unit) p.price_unit = s.price_unit;
  if (Object.keys(s.attrs).length) p.attrs = s.attrs;
  return p;
}

export function savedToSearch(p: SavedSearchParams): SearchState {
  const s: SearchState = { attrs: { ...(p.attrs ?? {}) }, view: 'list' };
  if (p.q) s.q = p.q;
  if (p.family) s.family = p.family;
  if (p.category) s.category = p.category;
  if (p.subcategory) s.subcategory = p.subcategory;
  if (p.province) s.province = p.province;
  if (p.district) s.district = p.district;
  if (p.price_min !== undefined) s.price_min = String(p.price_min);
  if (p.price_max !== undefined) s.price_max = String(p.price_max);
  if (p.price_unit) s.price_unit = String(p.price_unit);
  return s;
}

export const searchHref = (s: SearchState): string => {
  const p = serializeSearch(s).toString();
  return p ? `/browse?${p}` : '/browse';
};

// --- calendar-day keys (`YYYY-MM-DD`, local) ---

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = (): string => dayKey(new Date());
export const addDaysKey = (k: string, n: number): string => {
  const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + n);
  return dayKey(d);
};
/** `10.12` — the short form the chips and banners use. */
export const shortDay = (k: string): string => `${k.slice(5, 7)}.${k.slice(8, 10)}`;
export const expandRange = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let k = start; k <= end && out.length < 400; k = addDaysKey(k, 1)) out.push(k);
  return out;
};

const RECENT_KEY = 'zm_recent';
export function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}
export function pushRecent(q: string): void {
  const t = q.trim();
  if (!t) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...readRecent().filter((x) => x !== t)].slice(0, 5)));
  } catch {
    /* storage unavailable */
  }
}

export const listingHref = (id: number, dates?: { from?: string; to?: string }): string =>
  dates?.from && dates.to ? `/posts/${id}?date_from=${dates.from}&date_to=${dates.to}` : `/posts/${id}`;
