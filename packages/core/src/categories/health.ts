/**
 * Listing completeness, 0–100 (E6, F5): the score plus what is missing, heaviest first, so the
 * UI can name the single most valuable thing to add (`provider.health*` strings).
 *
 * Weights: photos (up to 5 count) 35 · required attributes 30 · details (120 characters) 20 ·
 * price 15 when the category has one (its weight is redistributed otherwise). Optional fields
 * feed filters but never withhold points, so a listing that answers the category reaches 100.
 */
export const HEALTH_PHOTO_TARGET = 5;
export const HEALTH_DETAILS_TARGET = 120;

export type HealthPart = 'photos' | 'attributes' | 'details' | 'price';
export interface ListingHealth { score: number; missing: HealthPart[]; hint: HealthPart | null }

interface HealthInput {
  imageCount?: number;
  attributes?: Record<string, unknown> | null;
  details?: string | null;
  price?: unknown;
  schema?: { has_price?: boolean; fields?: Array<{ key: string; required?: boolean }> } | null;
}

const filled = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

export function listingHealth({ imageCount = 0, attributes, details, price, schema }: HealthInput): ListingHealth {
  const required = (schema?.fields ?? []).filter((f) => f.required);
  const parts: Array<{ key: HealthPart; weight: number; ratio: number }> = [
    { key: 'photos', weight: 35, ratio: Math.min(imageCount, HEALTH_PHOTO_TARGET) / HEALTH_PHOTO_TARGET },
    { key: 'attributes', weight: 30, ratio: required.length ? required.filter((f) => filled(attributes?.[f.key])).length / required.length : 1 },
    { key: 'details', weight: 20, ratio: Math.min((details ?? '').trim().length, HEALTH_DETAILS_TARGET) / HEALTH_DETAILS_TARGET },
  ];
  if (schema?.has_price) parts.push({ key: 'price', weight: 15, ratio: Number(price) > 0 ? 1 : 0 });
  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round((parts.reduce((s, p) => s + p.weight * p.ratio, 0) / total) * 100);
  const missing = parts
    .map((p) => ({ key: p.key, lost: p.weight * (1 - p.ratio) }))
    .filter((p) => p.lost > 0.5)
    .sort((a, b) => b.lost - a.lost)
    .map((p) => p.key);
  return { score, missing, hint: missing[0] ?? null };
}
