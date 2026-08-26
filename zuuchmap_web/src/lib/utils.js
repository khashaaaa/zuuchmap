import i18n from '@/i18n'
import {
  Car, Hammer, Wrench, Store, Factory, HardHat, Briefcase, AlertCircle,
  Package, Truck, PenTool, Mountain, Snowflake, Building2, Bus, Cog,
  FileText, Users as UsersIcon, Gem, Tag,
} from 'lucide-react'

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

// Prices are always grouped mn-MN and always whole tugriks. A bare
// toLocaleString() followed the *viewer's browser* locale, so the same listing
// read 250,000₮ here and 250.000₮ on a de-DE machine — and price_amount arrives
// as a Postgres decimal ("250000.00"), whose tail has no business on screen.
const PRICE_FORMAT = { maximumFractionDigits: 0 }

/**
 * A price is renderable only if it is a real, non-zero number. `price_amount`
 * arrives as a Postgres decimal string, so a malformed row coerces to NaN —
 * which used to render literally as "NaN₮" here while the app dropped the price
 * entirely. Both now return null and the caller hides the line.
 */
const priceValue = (amount) => {
  if (!amount) return null
  const n = Number(amount)
  return Number.isNaN(n) ? null : n
}

export const formatPrice = (amount, unit, t) => {
  const value = priceValue(amount)
  if (value === null) return null
  const formatted = value.toLocaleString('mn-MN', PRICE_FORMAT)
  // A total (sale) price is the whole amount — a "/unit" suffix would misread as recurring
  if (unit === 'TOTAL') return `${formatted}₮`
  const unitLabel = t ? t(PRICE_UNIT_KEYS[unit] ?? '', { defaultValue: unit ?? '' }) : (unit ?? '')
  return unitLabel ? `${formatted}₮/${unitLabel}` : `${formatted}₮`
}

/**
 * The price split into amount and unit so a display can weight them
 * differently (big amount, quiet unit). Same rules as formatPrice.
 */
export const formatPriceParts = (amount, unit, t) => {
  const value = priceValue(amount)
  if (value === null) return null
  const formatted = `${value.toLocaleString('mn-MN', PRICE_FORMAT)}₮`
  if (unit === 'TOTAL') return { amount: formatted, unit: null }
  const unitLabel = t ? t(PRICE_UNIT_KEYS[unit] ?? '', { defaultValue: unit ?? '' }) : (unit ?? '')
  return { amount: formatted, unit: unitLabel || null }
}

/**
 * `YYYY.MM.DD` — the Mongolian convention. Assembled by hand rather than through
 * Intl so it is a fixed string and not a runtime's idea of `mn-MN`: the app has
 * to build it this way (React Native's JSC ships without full ICU on Android and
 * would silently fall back to en-US), and the two are checked against each other
 * by `npm run check:sync`. Going through toLocaleDateString here made them agree
 * only by coincidence — an ICU update on either side could have split them.
 */
export const formatDate = (date) => {
  if (!date) return '—'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return i18n.t('common.invalidDate')
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('.')
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


// Exact-locale label from a schema object's labels map ({mn,en}); null if absent
export const resolveSchemaLabel = (obj) => obj?.labels?.[i18n.language] ?? null

// Resolution order matches getSubcategoryLabel: the schema's own translations,
// then client i18n, then whatever the schema stored. The i18n step used to run
// through a hardcoded map of eight keys, so the five categories added after it
// was written skipped localization entirely and fell through to the raw label.
// Categories are admin-editable data; nothing here may enumerate them.
export const getCategoryLabel = (key, t, schemas = []) => {
  if (!key) return key
  const schema = schemas.find((s) => s.key === key)
  const localized = resolveSchemaLabel(schema)
  if (localized) return localized
  if (t) return t(`category.${key}`, { defaultValue: schema?.label ?? key })
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

/**
 * Human-readable post title. `title` is nullable server-side, so most of this
 * function is the fallback chain for an untitled post:
 *
 *   title → "manufacturer model" → subcategory label → category label
 *
 * Derived from whichever identifying attributes the category defines rather
 * than from a list of category keys, so any vertical reusing these field keys
 * gets the same treatment for free.
 *
 * MIRRORED in `zuuchmap_app/src/utils/postUtils.js` — the two used to disagree,
 * and an untitled excavator listing read "Komatsu PC200-8" in the app but
 * "Machinery Rental" here, including in the two admin queues. Change both
 * together; `scripts/check-sync.js` fails the build if they drift.
 */
export const getPostTitle = (post, t, schemas = []) => {
  if (post?.title) return post.title
  const attrs = post?.attributes || {}
  const name = [attrs.manufacturer, attrs.model].filter(Boolean).join(' ').trim()
  if (name) return name
  // Only 42 of the 79 seeded subcategory values carry a client i18n key, so a
  // subcategory is used as a title only when it actually resolved to something
  // human — otherwise "excavator" would ship as the visible title. Passing
  // `schemas` widens this to every value the admin has labelled.
  const schema = schemas.find((s) => s.key === post?.category)
  const sub = post?.subcategory ? getSubcategoryLabel(post.subcategory, t, schema) : ''
  if (sub && sub !== post.subcategory) return sub
  return getCategoryLabel(post?.category, t, schemas) || '—'
}

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
export const externalHref = (v) => normalizeWebsiteUrl(v)

// --- Form validation ---
//
// Mirrors zuuchmap_app/src/utils/formUtils.js and is checked behaviourally by
// `npm run check:sync`. These used to live only on the app: the web leaned on
// the browser's built-in validation, which accepts a different set — type="tel"
// validates nothing at all, type="email" passes "a@b" (no dot), and type="url"
// *rejects* the bare "example.mn" the app quietly normalises. The company DTOs
// carry no server-side decorators, so these are the only gate there is.
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export const validatePhone = (phone, minLength = 8, maxLength = 15) => {
  if (!phone || typeof phone !== 'string') return false
  const digitsOnly = phone.replace(/[^\d]/g, '')
  return /^\d+$/.test(digitsOnly) && digitsOnly.length >= minLength && digitsOnly.length <= maxLength
}

export const validateRequired = (value) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

export const normalizeWebsiteUrl = (url) => {
  if (!url || url.trim() === '') return ''
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

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

/**
 * A schema's admin-editable `icon` is an Ionicons name (the app renders it
 * natively); the web maps it onto the lucide set already shipped. Unknown
 * names fall back to a neutral tag glyph rather than rendering nothing.
 */
const ICON_MAP = {
  car: Car, bus: Bus, hammer: Hammer, construct: Wrench, build: HardHat,
  business: Building2, storefront: Store, briefcase: Briefcase,
  'alert-circle': AlertCircle, warning: AlertCircle, cube: Package,
  snow: Snowflake, settings: Cog, 'document-text': FileText,
  people: UsersIcon, diamond: Gem, pricetag: Tag,
  'color-palette': PenTool, earth: Mountain, factory: Factory, truck: Truck,
}

export const getCategoryIcon = (ioniconName) => {
  if (!ioniconName) return Tag
  const base = String(ioniconName).replace(/-(outline|sharp)$/, '')
  return ICON_MAP[base] ?? Tag
}

// A dead R2 URL otherwise renders the browser's broken-image glyph inside the
// layout. Hiding the element lets the container's own placeholder background
// show through, which reads as "no photo" rather than "this page is broken".
export const hideBrokenImage = (e) => { e.currentTarget.style.visibility = 'hidden' }

/**
 * Human-readable location for a post. `province`/`district` are stored as enum
 * codes (BAYANZURKH, ULAANBAATAR) and were being printed raw on every card and
 * detail page; the i18n keys have existed all along.
 */
export const getLocationLabel = (post, t) => [
  post?.district && t(`district.${post.district}`, { defaultValue: post.district }),
  post?.province && t(`province.${post.province}`, { defaultValue: post.province }),
].filter(Boolean).join(', ')

/**
 * The signed-in shell scrolls an inner <main> (AppLayout pins the page at
 * `h-full overflow-hidden`), while public pages scroll the document. A bare
 * `window.scrollTo` is therefore a no-op on every authed route — paging used to
 * jump the public grid to the top and do nothing at all once you signed in.
 * Anything that wants "back to the top" has to ask for whichever one is mounted.
 */
export const APP_SCROLL_ID = 'app-scroll'

export const scrollToTop = (smooth = true) => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const behavior = smooth && !reduce ? 'smooth' : 'auto'
  const el = document.getElementById(APP_SCROLL_ID)
  if (el) el.scrollTo({ top: 0, behavior })
  else window.scrollTo({ top: 0, behavior })
}

/**
 * Freezes whichever surface is scrolling while an overlay is up, and returns
 * the release. Counted rather than a boolean: closing one overlay while another
 * is still open must not hand the page back its scrollbar.
 */
let scrollLocks = 0

export const lockScroll = () => {
  const targets = [document.body, document.getElementById(APP_SCROLL_ID)].filter(Boolean)
  if (scrollLocks === 0) {
    targets.forEach((el) => { el.dataset.prevOverflow = el.style.overflow; el.style.overflow = 'hidden' })
  }
  scrollLocks += 1
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1)
    if (scrollLocks === 0) {
      targets.forEach((el) => { el.style.overflow = el.dataset.prevOverflow ?? ''; delete el.dataset.prevOverflow })
    }
  }
}
