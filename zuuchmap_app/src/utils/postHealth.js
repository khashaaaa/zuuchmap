// Listing quality score, 0–100.
//
// Providers are shown this on their own cards and at the top of the form so a
// thin post — one photo, no description — is flagged before it reaches the
// admin queue, not after it sits unbooked for a week. The weights favour what
// customers actually scan: photos first, then the category attributes that feed
// filters, then the prose, then price.
//
// Works on both shapes: an API post (`price_amount`, `images`, `attributes`)
// and the create-form state (same keys — `formUtils` keeps them aligned).
//
// Mirrored in zuuchmap_web/src/lib/postHealth.js and checked behaviourally by
// scripts/check-sync.js — change both together.

export const HEALTH_PHOTO_TARGET = 5;
export const HEALTH_DETAILS_TARGET = 120; // characters

const WEIGHTS = { photos: 35, attributes: 30, details: 20, price: 15 };

const isFilled = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    // A switch reading "no" is an answer, not a blank. Scoring it as unfilled
    // punished an honest no forever, since the score only ever counts fields
    // the category requires.
    return true;
};

export const healthBand = (score) => (score >= 75 ? 'good' : score >= 45 ? 'fair' : 'poor');

/**
 * @returns {{ score: number, band: 'good'|'fair'|'poor', missing: 'photos'|'attributes'|'details'|'price'|null, parts: object }}
 *   `missing` names the single item whose fix gains the most points.
 */
export const computePostHealth = (post, schema) => {
    if (!post) return { score: 0, band: 'poor', missing: 'photos', parts: {} };

    const images = Array.isArray(post.images) ? post.images : [];
    const photoRatio = Math.min(images.length / HEALTH_PHOTO_TARGET, 1);

    // Required fields only. Dividing by *every* field meant a listing that
    // answered everything the category demands still scored 82-94 and was told
    // to add more — a bar it could never clear. Optional fields still earn
    // their keep by feeding filters; they no longer withhold points.
    const fields = schema?.fields ?? [];
    const required = fields.filter((f) => f.required);
    const attrs = post.attributes ?? {};
    const attrRatio = required.length
        ? required.filter((f) => isFilled(attrs[f.key])).length / required.length
        : 1;

    const detailsLen = String(post.details ?? '').trim().length;
    const detailsRatio = Math.min(detailsLen / HEALTH_DETAILS_TARGET, 1);

    const hasPrice = !!schema?.has_price;
    const priceRatio = hasPrice ? (Number(post.price_amount) > 0 ? 1 : 0) : null;

    // A category without a price redistributes that weight so the ceiling
    // stays 100 — a job vacancy should not be capped at 85 for lacking a rate.
    const total = WEIGHTS.photos + WEIGHTS.attributes + WEIGHTS.details + (hasPrice ? WEIGHTS.price : 0);
    const scale = 100 / total;

    const parts = {
        photos: photoRatio * WEIGHTS.photos * scale,
        attributes: attrRatio * WEIGHTS.attributes * scale,
        details: detailsRatio * WEIGHTS.details * scale,
        price: hasPrice ? priceRatio * WEIGHTS.price * scale : 0,
    };
    const score = Math.round(parts.photos + parts.attributes + parts.details + parts.price);

    const gaps = [
        ['photos', WEIGHTS.photos * scale - parts.photos],
        ['attributes', WEIGHTS.attributes * scale - parts.attributes],
        ['details', WEIGHTS.details * scale - parts.details],
        ['price', hasPrice ? WEIGHTS.price * scale - parts.price : 0],
    ].filter(([, gap]) => gap >= 1);
    gaps.sort((a, b) => b[1] - a[1]);

    return { score, band: healthBand(score), missing: gaps[0]?.[0] ?? null, parts };
};
