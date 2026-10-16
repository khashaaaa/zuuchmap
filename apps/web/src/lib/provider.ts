import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  BlockDaysRequest, BlockDaysResponse, BookingValue, CategoryView, FieldIssue, Company, CompanyWriteRequest, Listing, ListingPerformanceDetail,
  ListingWriteRequest, MyCompanyResponse, MyListingItem, MyListingStats, MyPerformance, ProviderHome, User,
} from '@zuuchmap/core';
import { EXPIRY_WARNING_DAYS } from '@zuuchmap/core';
import { api, errorKey } from './api';
import { useAuthStore } from './auth';
import { useToast } from './toast';

const DAY_MS = 86_400_000;
export const TITLE_MIN = 10;
export const TITLE_MAX = 80;
export const MAX_PHOTOS = 10;

// ---- queries ---------------------------------------------------------------

const useToken = () => useAuthStore((s) => s.token);

export function useProviderHome() {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'home', token], enabled: !!token, queryFn: () => api<ProviderHome>('/provider/home') });
}

export function useProfile() {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'profile', token], enabled: !!token, queryFn: () => api<User>('/user/profile') });
}

export function useMyListings() {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'mine', token], enabled: !!token, queryFn: () => api<MyListingItem[]>('/posts/mine') });
}

export function useMyStats() {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'stats', token], enabled: !!token, queryFn: () => api<MyListingStats>('/posts/mine/stats') });
}

export function useMyPerformance(days = 7) {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'perf', days, token], enabled: !!token, queryFn: () => api<MyPerformance>('/posts/mine/performance', { query: { days } }) });
}

export function useListingPerformance(id: number) {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'perf-one', id, token], enabled: !!token, retry: false, queryFn: () => api<ListingPerformanceDetail>(`/posts/${id}/performance`) });
}

export function useBookingValue(month: string) {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'value', month, token], enabled: !!token, queryFn: () => api<BookingValue>('/bookings/value', { query: { month } }) });
}

export function useMyCompany() {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'company', token], enabled: !!token, queryFn: () => api<MyCompanyResponse>('/company/mine') });
}

/** The owner's own view of one listing (carries `pending_revision` and the rejection). */
export function useOwnListing(id: number | null) {
  const token = useToken();
  return useQuery({ queryKey: ['provider', 'listing', id, token], enabled: !!token && id !== null, retry: false, gcTime: 0, queryFn: () => api<Listing>(`/posts/${id}`) });
}

/** Everything a listing change can touch: provider screens, browse, detail, availability. */
export function useRefreshListings(): () => void {
  const qc = useQueryClient();
  return () => {
    for (const key of ['provider', 'listing', 'browse', 'browse-once', 'availability', 'map', 'stats', 'seller', 'badges']) void qc.invalidateQueries({ queryKey: [key] });
  };
}

// ---- mutations -------------------------------------------------------------

export function useRenewListing() {
  const refresh = useRefreshListings();
  const toast = useToast();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: number) => api<Listing>(`/posts/${id}/renew`, { method: 'POST' }),
    onSuccess: () => {
      refresh();
      toast.success(t('prov.renew.done'));
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
}

export function useDeleteListing() {
  const refresh = useRefreshListings();
  const toast = useToast();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: number) => api<{ ok: true }>(`/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success(t('prov.actions.deleted'));
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
}

export function useBlockDays() {
  const refresh = useRefreshListings();
  return useMutation({
    mutationFn: (body: BlockDaysRequest) => api<BlockDaysResponse>('/posts/availability/block', { method: 'POST', body }),
    onSuccess: refresh,
  });
}

export function useUnblockDays() {
  const refresh = useRefreshListings();
  return useMutation({
    mutationFn: (id: number) => api<{ ok: true }>(`/posts/availability/block/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useSaveCompany(existing: Company | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompanyWriteRequest) => api<Company>('/company', { method: existing ? 'PATCH' : 'POST', body }),
    onSuccess: () => {
      for (const key of ['provider', 'seller', 'listing']) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** A customer taps Call on a listing: fire-and-forget, the dialer opens regardless. */
export function recordCall(postId: number): void {
  void api(`/posts/${postId}/contact`, { method: 'POST', body: { kind: 'CALL' } }).catch(() => undefined);
}

// ---- listing state ---------------------------------------------------------

export type ListingState = 'draft' | 'rejected' | 'pending' | 'expired' | 'live';

export interface ListingFacts {
  state: ListingState;
  /** Live, with an edit waiting for the admin. */
  underReview: boolean;
  /** Live, and the admin refused its last edit. */
  refusedEdit: boolean;
  expiring: boolean;
  daysLeft: number | null;
}

const lapsed = (p: MyListingItem, now: number): boolean => p.status === 'EXPIRED' || (!!p.expires_at && new Date(p.expires_at).getTime() <= now);

export function listingFacts(p: MyListingItem, now = Date.now()): ListingFacts {
  const daysLeft = p.expires_at ? Math.max(0, Math.ceil((new Date(p.expires_at).getTime() - now) / DAY_MS)) : null;
  const base = { underReview: false, refusedEdit: false, expiring: false, daysLeft };
  if (p.is_draft) return { ...base, state: 'draft' };
  if (p.approval_status === 'REJECTED') return { ...base, state: 'rejected' };
  if (p.approval_status !== 'APPROVED') return { ...base, state: 'pending' };
  if (lapsed(p, now)) return { ...base, state: 'expired' };
  return {
    state: 'live',
    underReview: !!p.pending_revision,
    refusedEdit: !p.pending_revision && !!p.rejection_reason,
    expiring: daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS,
    daysLeft,
  };
}

export type ListingFilter = 'all' | 'live' | 'attention' | 'draft';

export function matchesFilter(f: ListingFacts, filter: ListingFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'live': return f.state === 'live';
    case 'draft': return f.state === 'draft';
    case 'attention': return f.state === 'rejected' || f.state === 'pending' || f.state === 'expired' || f.refusedEdit || f.expiring;
  }
}

// ---- wizard ----------------------------------------------------------------

export interface WizardPhoto { key: string; url: string }

export interface WizardForm {
  category: string | null;
  subcategory: string | null;
  title: string;
  details: string;
  attributes: Record<string, unknown>;
  images: WizardPhoto[];
  /** Digits only; shown grouped. */
  price: string;
  price_unit: string;
  province: string;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export const EMPTY_FORM: WizardForm = {
  category: null, subcategory: null, title: '', details: '', attributes: {}, images: [], price: '', price_unit: '',
  province: '', district: '', address: '', latitude: null, longitude: null,
};

const BASE_FIELD_STEP: Record<string, number> = {
  title: 2, details: 2, images: 2, attributes: 2, subcategory: 2,
  price_amount: 3, price_unit: 3, available_from: 3, available_until: 3,
  province: 4, district: 4, address: 4, latitude: 4, longitude: 4, location: 4,
};

/** The wizard step holding a rejected field (base fields by name, category fields on step 2). */
export function stepForField(field: string | null | undefined): number {
  if (!field) return 5;
  return BASE_FIELD_STEP[field] ?? 2;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** An existing listing (or its pending revision, which is what the owner edits) as wizard state. */
export function formFromListing(l: Listing, withPhotos = true): WizardForm {
  const rev = l.pending_revision;
  const src = rev
    ? { title: rev.title, details: rev.details, subcategory: rev.subcategory, province: rev.province, district: rev.district, address: rev.address, latitude: rev.latitude, longitude: rev.longitude, price: rev.price_amount, price_unit: rev.price_unit, attributes: rev.attributes, images: rev.images }
    : { title: l.title, details: l.details, subcategory: l.subcategory, province: l.province, district: l.district, address: l.address, latitude: l.latitude, longitude: l.longitude, price: l.price_amount, price_unit: l.price_unit, attributes: l.attributes, images: l.images ?? [] };
  const price = num(src.price);
  return {
    category: l.category,
    subcategory: src.subcategory ?? null,
    title: src.title ?? '',
    details: src.details ?? '',
    attributes: { ...(src.attributes ?? {}) },
    images: withPhotos ? (src.images ?? []).map((k) => ({ key: k, url: k })) : [],
    price: price === null ? '' : String(Math.round(price)),
    price_unit: src.price_unit ?? '',
    province: src.province ?? '',
    district: src.district ?? '',
    address: src.address ?? '',
    latitude: src.latitude === null || src.latitude === undefined ? null : Number(src.latitude),
    longitude: src.longitude === null || src.longitude === undefined ? null : Number(src.longitude),
  };
}

const filled = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/** Drops empty attribute values so the engine never sees blanks. */
function cleanAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attrs).filter(([, v]) => filled(v)));
}

export function toRequest(form: WizardForm, opts: { create: boolean; phone?: string | null; draft?: boolean; cat?: CategoryView; submit?: boolean }): ListingWriteRequest {
  // Drafts send only what was touched; a real submit reads an untouched switch as "no" (the engine wants the key present).
  const off = opts.submit ? Object.fromEntries((opts.cat?.fields ?? []).filter((f) => f.type === 'boolean').map((f) => [f.key, false])) : {};
  const price = num(form.price);
  const body: ListingWriteRequest = {
    subcategory: form.subcategory,
    title: form.title.trim(),
    details: form.details.trim() || null,
    attributes: { ...off, ...cleanAttributes(form.attributes) },
    images: form.images.map((p) => p.key),
    price_amount: price,
    price_unit: (form.price_unit || null) as ListingWriteRequest['price_unit'],
    province: form.province || null,
    district: form.province === 'ULAANBAATAR' ? form.district || null : null,
    address: form.address.trim() || null,
    latitude: form.latitude,
    longitude: form.longitude,
  };
  if (opts.create) {
    body.category = form.category ?? undefined;
    body.draft = opts.draft ?? false;
    if (opts.phone) body.contact_phone = opts.phone;
  }
  return body;
}

export type FieldError = 'required' | 'titleMin' | 'range';
export type FieldErrors = Partial<Record<string, FieldError>>;

/** Step-by-step validation; keys are base field names or `attr.<key>`.  */
export function validateStep(step: number, form: WizardForm, cat: CategoryView | undefined): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 1 && !form.category) errors.category = 'required';
  if (step === 2) {
    const len = form.title.trim().length;
    if (len < TITLE_MIN) errors.title = 'titleMin';
    for (const f of cat?.fields ?? []) {
      if (f.required && f.type !== 'boolean' && !filled(form.attributes[f.key])) errors[`attr.${f.key}`] = 'required';
      const v = num(form.attributes[f.key] as string | number | null);
      if (f.type === 'number' && v !== null && ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))) errors[`attr.${f.key}`] = 'range';
    }
  }
  if (step === 3 && cat?.has_price) {
    if (!(Number(form.price) > 0)) errors.price = 'required';
  }
  if (step === 4) {
    if (!form.province) errors.province = 'required';
    if (form.province === 'ULAANBAATAR' && !form.district) errors.district = 'required';
  }
  return errors;
}

/** The step a field-error key lives on. */
export const stepOfError = (key: string): number => (key === 'category' ? 1 : key === 'title' || key.startsWith('attr.') ? 2 : key === 'price' ? 3 : 4);

/** A field error as text; `field` names the field in the "required" message. */
export function useErrorText(): (e: FieldError | undefined, field: string) => string | undefined {
  const { t } = useTranslation();
  return (e, field) => (!e ? undefined : e === 'required' ? t('form.fieldRequired', { field }) : e === 'titleMin' ? t('prov.wizard.titleMin', { min: TITLE_MIN, count: 0 }) : t('ui.prov.rangeError'));
}

/** Engine field issues as wizard field errors (`attr.<key>`); the first step that holds one. */
export function issuesToErrors(issues: FieldIssue[]): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) out[i.key === 'category' ? 'category' : i.key === 'subcategory' ? 'category' : `attr.${i.key}`] = i.code === 'required' ? 'required' : 'range';
  return out;
}
