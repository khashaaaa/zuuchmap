import type { CategoryView, Listing, ListingWriteRequest, MyListingItem, PriceUnit } from '@zuuchmap/core';

export interface WizardForm {
  category: string | null;
  subcategory: string | null;
  title: string;
  details: string;
  attrs: Record<string, unknown>;
  /** Digits only. */
  price: string;
  price_unit: string | null;
  province: string | null;
  district: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  /** Uploaded photo keys, cover first. */
  images: string[];
}

export const EMPTY_FORM: WizardForm = {
  category: null, subcategory: null, title: '', details: '', attrs: {}, price: '', price_unit: null,
  province: null, district: null, address: '', lat: null, lng: null, images: [],
};

export const TITLE_MIN = 10;
export const TITLE_MAX = 80;
export const DETAILS_MAX = 5000;
export const STEP_COUNT = 5;

const empty = (v: unknown): boolean => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

type Source = Pick<Listing, 'category' | 'subcategory' | 'title' | 'province' | 'district' | 'address' | 'latitude' | 'longitude' | 'price_amount' | 'price_unit' | 'attributes'> & { details?: string | null };

/** The form for an existing listing. A pending proposal wins over the live row (the owner edits what they proposed). */
/** `posts/<owner>/<id>.jpg` out of a photo URL (or a bare key). */
export const photoKey = (urlOrKey: string): string | null => urlOrKey.match(/posts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)/)?.[0] ?? null;

export function formFromListing(l: Source & Partial<Pick<MyListingItem, 'pending_revision'>> & { images?: string[] | null }, cat?: CategoryView, copy = false): WizardForm {
  const r = l.pending_revision ?? null;
  const pick = <K extends keyof Source>(k: K): Source[K] => (r && k in r ? ((r as unknown as Source)[k]) : l[k]);
  const price = pick('price_amount');
  return {
    category: l.category,
    subcategory: pick('subcategory') ?? null,
    title: pick('title') ?? '',
    details: pick('details') ?? '',
    attrs: { ...(pick('attributes') ?? {}) },
    price: price === null || price === undefined || Number(price) === 0 ? '' : String(Math.round(Number(price))),
    price_unit: (pick('price_unit') as string | null) ?? cat?.default_price_unit ?? null,
    province: pick('province') ?? null,
    district: pick('district') ?? null,
    address: pick('address') ?? '',
    lat: pick('latitude') ?? null,
    lng: pick('longitude') ?? null,
    images: copy ? [] : ((r?.images ?? l.images) ?? []).map(photoKey).filter((k): k is string => !!k),
  };
}

/** The API body for a form. Empty attributes are dropped. */
export function toPayload(f: WizardForm, phone: string | null): ListingWriteRequest {
  const attributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f.attrs)) if (!empty(v)) attributes[k] = v;
  const price = Number(f.price);
  return {
    category: f.category ?? undefined,
    subcategory: f.subcategory,
    title: f.title.trim(),
    details: f.details.trim() || null,
    attributes,
    price_amount: f.price && price > 0 ? price : null,
    price_unit: f.price && price > 0 ? (f.price_unit as PriceUnit | null) : null,
    province: f.province,
    district: f.district,
    address: f.address.trim() || null,
    latitude: f.lat,
    longitude: f.lng,
    contact_phone: phone,
    images: f.images,
  };
}

/** Only what differs from the original payload (an edit sends no more than it changes). */
export function diffPayload(next: ListingWriteRequest, base: ListingWriteRequest): ListingWriteRequest {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(next) as Array<keyof ListingWriteRequest>) {
    if (k === 'category') continue;
    if (JSON.stringify(next[k] ?? null) !== JSON.stringify(base[k] ?? null)) out[k] = next[k];
  }
  return out as ListingWriteRequest;
}

export type FieldErrors = Record<string, string>;
type Tr = (key: string, o?: Record<string, unknown>) => string;

/** Field key -> message for one step (1-based). Keys are API names (`title`, `price_amount`) or attribute keys. */
export function validateStep(step: number, f: WizardForm, cat: CategoryView | undefined, t: Tr): FieldErrors {
  const e: FieldErrors = {};
  if (step === 1) {
    if (!f.category) e.category = t('ui.required');
    else if (cat && cat.subcategories.length > 0 && !f.subcategory) e.subcategory = t('ui.required');
  }
  if (step === 2) {
    const n = f.title.trim().length;
    if (n < TITLE_MIN) e.title = t('prov.wizard.titleMin', { min: TITLE_MIN, count: n });
    for (const fd of cat?.fields ?? []) {
      const v = f.attrs[fd.key];
      if (fd.required && empty(v) && fd.type !== 'boolean') e[fd.key] = t('form.fieldRequired', { field: fd.label });
      else if (fd.type === 'boolean' && fd.required && typeof v !== 'boolean') e[fd.key] = t('form.fieldRequired', { field: fd.label });
      else if (fd.type === 'number' && !empty(v)) {
        const num = Number(v);
        if (!Number.isFinite(num) || (fd.min !== undefined && num < fd.min) || (fd.max !== undefined && num > fd.max)) e[fd.key] = t('ui.emailInvalid');
      }
    }
  }
  if (step === 3 && cat?.has_price) {
    if (!(Number(f.price) > 0)) e.price_amount = t('form.fieldRequired', { field: t('common.price') });
    else if (!f.price_unit) e.price_unit = t('ui.required');
  }
  if (step === 4 && !f.province) e.province = t('form.fieldRequired', { field: t('common.province') });
  return e;
}

const BASE_STEP: Record<string, number> = {
  category: 1, subcategory: 1,
  title: 2, details: 2, images: 2, attributes: 2,
  price_amount: 3, price_unit: 3, available_from: 3, available_until: 3,
  province: 4, district: 4, address: 4, latitude: 4, longitude: 4, location: 4,
};

/** The wizard step holding a moderation `rejection_field` or a server field name. */
export function stepForField(key: string | null | undefined, cat?: CategoryView): number {
  if (!key) return 2;
  if (key in BASE_STEP) return BASE_STEP[key];
  if (cat?.fields.some((f) => f.key === key)) return 2;
  return 2;
}
