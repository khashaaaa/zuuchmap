import L from 'leaflet'
import i18n from '@/i18n'

export const cn = (...classes) => classes.filter(Boolean).join(' ')

// Mirrors zuuchmap_engine/src/enums/priceunit.ts — keep in sync.
export const PRICE_UNITS = ['HOUR', 'MOTO_HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT', 'PIECE', 'SQM', 'TRIP', 'TOTAL']

/**
 * Message to show for a failed API call. Server rule errors carry a stable
 * machine `code`; localize it (errors.codes.<CODE>) so a dialog never shows the
 * raw English server string. Falls back to the server message, then `fallback`.
 */
export const apiErrorMessage = (error, t, fallback) => {
  const code = error?.response?.data?.code
  if (code) {
    const localized = t(`errors.codes.${code}`, { defaultValue: '' })
    if (localized) return localized
  }
  // Throttler 429s carry no code and an English-only message — localize them.
  if (error?.response?.status === 429) return t('errors.tooManyRequests')
  return error?.response?.data?.message || fallback
}

const PRICE_UNIT_KEYS = { HOUR: 'priceUnit.hour', MOTO_HOUR: 'priceUnit.moto_hour', DAY: 'priceUnit.day', WEEK: 'priceUnit.week', MONTH: 'priceUnit.month', PROJECT: 'priceUnit.project', UNIT: 'priceUnit.unit', PIECE: 'priceUnit.piece', SQM: 'priceUnit.sqm', TRIP: 'priceUnit.trip', TOTAL: 'priceUnit.total' }

export const formatPrice = (amount, unit, t) => {
  if (!amount) return null
  const formatted = Number(amount).toLocaleString()
  // A total (sale) price is the whole amount — a "/unit" suffix would misread as recurring
  if (unit === 'TOTAL') return `${formatted}₮`
  const unitLabel = t ? t(PRICE_UNIT_KEYS[unit] ?? '', { defaultValue: unit ?? '' }) : (unit ?? '')
  return unitLabel ? `${formatted}₮/${unitLabel}` : `${formatted}₮`
}

export const formatDate = (date, locale) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(locale || 'mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// Location codes — mirror the engine's Province/District enums. Display names
// come from i18n (`province.<CODE>` / `district.<CODE>`), never from here.
export const PROVINCES = [
  'ULAANBAATAR', 'ARKHANGAI', 'BAYANOLGII', 'BAYANKHONGOR', 'BULGAN',
  'GOVIALTAI', 'GOVISUMBER', 'DARKHANUUL', 'DORNOGOVI', 'DORNOD',
  'DUNDGOVI', 'ZAVKHAN', 'ORKHON', 'UVURKHANGAI', 'UMNUGOVI',
  'SUKHBAATAR', 'SELENGE', 'TUV', 'UVS', 'KHOVD',
  'KHUVSGUL', 'KHENTII',
]

export const DISTRICTS = [
  'BAGANUUR', 'BAGAKHANGAI', 'BAYANGOL', 'BAYANZURKH', 'NALAIKH',
  'SONGINOKHAIRKHAN', 'SUKHBAATAR', 'KHANUUL', 'CHINGELTEI',
]

export const CATEGORIES = {
  vehiclerent: 'category.vehiclerent',
  toolrent: 'category.toolrent',
  machineryrent: 'category.machineryrent',
  materialstore: 'category.materialstore',
  factory: 'category.factory',
  construction: 'category.construction',
  jobvacancy: 'category.jobvacancy',
  sos: 'category.sos',
}


// Exact-locale label from a schema object's labels map ({mn,en}); null if absent
export const resolveSchemaLabel = (obj) => obj?.labels?.[i18n.language] ?? null

export const getCategoryLabel = (key, t, schemas = []) => {
  if (!key) return key
  const schema = schemas.find((s) => s.key === key)
  const localized = resolveSchemaLabel(schema)
  if (localized) return localized
  if (t && CATEGORIES[key]) return t(CATEGORIES[key]) || key
  return schema?.label ?? key
}

export const getSubcategoryLabel = (value, t, schema) => {
  if (!value) return value
  const sub = schema?.subcategories?.find((s) => s.value === value)
  const localized = resolveSchemaLabel(sub)
  if (localized) return localized
  if (t) return t(`subcategory.${value}`, { defaultValue: sub?.display ?? value })
  return sub?.display ?? value
}

export const getFieldLabel = (field, t) => {
  const localized = resolveSchemaLabel(field)
  if (localized) return localized
  if (t) {
    const camel = field.key.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    return t(`attrs.${camel}`, { defaultValue: field.label })
  }
  return field.label
}

export const getOptionLabel = (opt, t) => {
  if (!t) return opt
  const camel = String(opt).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  return t(`attrs.${camel}`, { defaultValue: opt })
}

export const getPostCategory = (post) => post?.category ?? null

export const getPostTitle = (post, t) => post?.title || getCategoryLabel(post?.category, t) || '—'

const API_URL = import.meta.env.VITE_API_URL ?? 'https://zuuchmap.com/engine'
const _local = (path, name) =>
  name ? `${API_URL}/uploads/${path}/${name}` : null

export const getImageUrl = (v) =>
  !v ? null : v.startsWith('http') ? v : _local('posts', v)

export const getProfileImageUrl = (v) =>
  !v ? null : v.startsWith('http') ? v : _local('profilepicture', v)

export const getCompanyLogoUrl = (v) =>
  !v ? null : v.startsWith('http') ? v : _local('companylogo', v)

export const debounce = (fn, ms = 300) => {
  let t
  const debounced = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
  // Lets consumers drop a pending call on unmount instead of firing setState
  // into a dead component.
  debounced.cancel = () => clearTimeout(t)
  return debounced
}

// User-entered URLs are stored raw; without a scheme the browser treats them
// as relative paths and the SPA catch-all swallows them into "/".
export const externalHref = (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`)

/**
 * Back navigation with a safety net: `navigate(-1)` on the first entry of a
 * session (deep link, opened in a new tab) silently does nothing, stranding
 * the user. React Router stamps its history index on `history.state.idx`, so
 * when there is nowhere to go back to we route to a sensible fallback instead.
 */
export const goBack = (navigate, fallback = '/') => {
  if (window.history.state?.idx > 0) navigate(-1)
  else navigate(fallback, { replace: true })
}

/**
 * Category colours — the web mirror of `zuuchmap_app/src/design/theme.js`.
 *
 * A category's colour is admin-editable and stored once, so the same hex has to
 * work on the dark and the light ground. These are all solved to the single
 * luminance where contrast is equal against both (4.0:1 either way), spaced
 * around the hue circle with the amber window left free so the primary always
 * reads as the brighter accent. Keep in sync with the app palette and with the
 * engine seeds in `post/category.service.ts`.
 */
export const CATEGORY_COLORS = {
  vehiclerent: '#558D39',
  machineryrent: '#6A7BC2',
  toolrent: '#976CC3',
  materialstore: '#848236',
  construction: '#3D8995',
  jobvacancy: '#BC5CA9',
  factory: '#3A8E5C',
  sos: '#D25562',
  usedequipment: '#C16546',
  transport: '#4984B4',
  designservice: '#8473C3',
  miningsupport: '#967A54',
  winterservice: '#4C869E',
}

const srgbToLinear = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
const luminance = (r, g, b) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)

const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const rgbToHsl = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

const hueToRgb = (p, q, t) => {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

const hslToRgb = (h, s, l) => {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)]
}

const toHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()

/** `#RRGGBB` + alpha -> `rgba()`, for tinted fills built from a category colour. */
export const withAlpha = (hex, alpha) => {
  if (typeof hex !== 'string') return hex
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`
}

const toneCache = new Map()

/**
 * Re-lights a category hex so it is legible *as text* on the active theme.
 * The stored colour is tuned for fills; text needs 4.5:1, and an admin can save
 * any hex at all, so we binary-search lightness for the target luminance rather
 * than trusting what was saved. Mirrors `toneForTheme` in the app theme.
 */
export const toneForTheme = (hex, isDark) => {
  if (typeof hex !== 'string' || !/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return hex
  const key = hex + (isDark ? 'd' : 'l')
  if (toneCache.has(key)) return toneCache.get(key)

  const target = isDark ? 0.3 : 0.12
  const [h, s] = rgbToHsl(...hexToRgb(hex))
  let lo = 0, hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (luminance(...hslToRgb(h, s, mid)) < target) lo = mid
    else hi = mid
  }
  const result = toHex(hslToRgb(h, s, (lo + hi) / 2))
  toneCache.set(key, result)
  return result
}

/** The colour a category should render in: admin-set, else its slot in the family. */
export const getCategoryColor = (key, schemas = []) =>
  schemas.find((s) => s.key === key)?.color || CATEGORY_COLORS[key] || null

const pinCache = new Map()

/**
 * Category-tinted Leaflet map pin. Replaces the stock PNG set that was fetched
 * from a remote CDN (a CSP/offline liability). Shape and ring mirror the
 * app's map marker (`CustomerMapView` `singleMarkerContainer`): category fill,
 * fixed white ring — pins sit on map tiles, not on a themed surface — small
 * tail. Geometry lives in `index.css` (`.map-pin`); only the fill varies here.
 */
export const categoryPin = (color) => {
  const fill = color || 'var(--color-muted)'
  if (!pinCache.has(fill)) {
    pinCache.set(fill, L.divIcon({
      className: 'map-pin-wrap',
      html: `<span class="map-pin" style="background:${fill}"></span>`,
      iconSize: [30, 37],
      iconAnchor: [15, 36], // tip of the tail
      popupAnchor: [0, -34],
    }))
  }
  return pinCache.get(fill)
}
