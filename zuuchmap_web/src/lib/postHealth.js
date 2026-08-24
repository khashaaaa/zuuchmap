/**
 * Listing completeness, 0–100. Pure: takes the form/post values and the
 * category schema, returns the score plus what is missing, heaviest first,
 * so the UI can name the single most valuable thing to add.
 *
 * Weights: photos (up to 5 count) 35 · attributes 30 · details 20 · price 15
 * (price only when the schema has one; its weight is redistributed otherwise).
 *
 * Attributes count REQUIRED schema fields only, so a listing that satisfies the
 * category reaches 100. Mirrored in zuuchmap_app/src/utils/postHealth.js and
 * checked behaviourally by scripts/check-sync.js — change both together.
 */
const PHOTO_TARGET = 5
const DETAILS_TARGET = 120

const isFilled = (v) => {
  if (v === undefined || v === null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  return true
}

export function computePostHealth({ imageCount = 0, attributes = {}, details = '', price, schema }) {
  const hasPrice = Boolean(schema?.has_price)
  const fields = schema?.fields ?? []
  const required = fields.filter((f) => f.required)
  const parts = [
    { key: 'photos', weight: 35, ratio: Math.min(imageCount, PHOTO_TARGET) / PHOTO_TARGET },
    {
      key: 'attributes',
      // Required fields only. Dividing by *every* field meant a listing that
      // answered everything the category demands still scored 82–94 and was
      // told to add more — a bar it could never clear. Optional fields still
      // earn their keep by feeding filters; they no longer withhold points.
      weight: 30,
      ratio: required.length ? required.filter((f) => isFilled(attributes?.[f.key])).length / required.length : 1,
    },
    { key: 'details', weight: 20, ratio: Math.min(String(details ?? '').trim().length, DETAILS_TARGET) / DETAILS_TARGET },
  ]
  if (hasPrice) parts.push({ key: 'price', weight: 15, ratio: Number(price) > 0 ? 1 : 0 })

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
  const score = Math.round(parts.reduce((s, p) => s + p.weight * p.ratio, 0) / totalWeight * 100)
  const missing = parts
    .map((p) => ({ key: p.key, lost: p.weight * (1 - p.ratio) }))
    .filter((p) => p.lost > 0.5)
    .sort((a, b) => b.lost - a.lost)
  return { score, missing, hint: missing[0]?.key ?? null }
}
