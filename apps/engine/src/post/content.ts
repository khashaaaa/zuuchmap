import type { ListingEditDiff, ListingRevision, PostSnapshot } from '@zuuchmap/core';
import type { Post } from './entities/post.entity';

/** Fields an edit may touch: omitted means unchanged, and a change sends a live listing to review. */
export const STR_FIELDS = [
  'subcategory', 'title', 'details', 'province', 'district', 'address', 'location',
  'price_unit', 'contact_phone', 'contact_email', 'website',
] as const;
export const NUM_FIELDS = ['latitude', 'longitude', 'price_amount'] as const;

/** A revision before it is timestamped. */
export type Content = Omit<ListingRevision, 'submitted_at'>;

const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export function contentOf(post: Post): Content {
  return {
    subcategory: post.subcategory, title: post.title, details: post.details, province: post.province,
    district: post.district, address: post.address, location: post.location, price_unit: post.price_unit,
    contact_phone: post.contact_phone, contact_email: post.contact_email, website: post.website,
    latitude: post.latitude, longitude: post.longitude, price_amount: num(post.price_amount),
    attributes: post.attributes, images: [...post.images],
  };
}

export function applyContent(post: Post, c: Content): void {
  for (const f of STR_FIELDS) post[f] = c[f];
  post.latitude = c.latitude;
  post.longitude = c.longitude;
  post.price_amount = c.price_amount === null ? null : String(c.price_amount);
  post.attributes = c.attributes ?? {};
  post.images = [...c.images];
}

const stable = (v: unknown): string => JSON.stringify(v ?? null, (_k, x: unknown) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : x);

export function diffContent(a: Content, b: Content): ListingEditDiff[] {
  const out: ListingEditDiff[] = [];
  for (const f of STR_FIELDS) if ((a[f] ?? null) !== (b[f] ?? null)) out.push({ field: f, before: a[f], after: b[f] });
  for (const f of NUM_FIELDS) if (num(a[f]) !== num(b[f])) out.push({ field: f, before: num(a[f]), after: num(b[f]) });
  if (stable(a.attributes ?? {}) !== stable(b.attributes ?? {})) out.push({ field: 'attributes', before: a.attributes, after: b.attributes });
  if (stable(a.images) !== stable(b.images)) out.push({ field: 'images', before: a.images, after: b.images });
  return out;
}

export const contentDiffers = (a: Content, b: Content): boolean => diffContent(a, b).length > 0;

export function snapshotOf(c: Content): PostSnapshot {
  return {
    title: c.title, details: c.details, price: num(c.price_amount), price_unit: c.price_unit,
    attributes: c.attributes, images: [...c.images], subcategory: c.subcategory,
    province: c.province, district: c.district,
  };
}

export function revisionContent(r: ListingRevision): Content {
  const c: Partial<ListingRevision> = { ...r };
  delete c.submitted_at;
  return c as Content;
}
