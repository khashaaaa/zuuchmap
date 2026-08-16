import i18n from '@/i18n'

export const cn = (...classes) => classes.filter(Boolean).join(' ')

export const PRICE_UNITS = ['HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT']

const PRICE_UNIT_KEYS = { HOUR: 'priceUnit.hour', DAY: 'priceUnit.day', WEEK: 'priceUnit.week', MONTH: 'priceUnit.month', PROJECT: 'priceUnit.project', UNIT: 'priceUnit.unit' }

export const formatPrice = (amount, unit, t) => {
  if (!amount) return null
  const formatted = Number(amount).toLocaleString()
  const unitLabel = t ? t(PRICE_UNIT_KEYS[unit] ?? '', { defaultValue: unit ?? '' }) : (unit ?? '')
  return unitLabel ? `${formatted}₮/${unitLabel}` : `${formatted}₮`
}

export const formatDate = (date, locale) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(locale || 'mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export const PROVINCES = [
  { value: 'ULAANBAATAR', label: 'Улаанбаатар' },
  { value: 'ARKHANGAI', label: 'Архангай' },
  { value: 'BAYANOLGII', label: 'Баян-Өлгий' },
  { value: 'BAYANKHONGOR', label: 'Баянхонгор' },
  { value: 'BULGAN', label: 'Булган' },
  { value: 'GOVIALTAI', label: 'Говь-Алтай' },
  { value: 'GOVISUMBER', label: 'Говьсүмбэр' },
  { value: 'DARKHANUUL', label: 'Дархан-Уул' },
  { value: 'DORNOGOVI', label: 'Дорноговь' },
  { value: 'DORNOD', label: 'Дорнод' },
  { value: 'DUNDGOVI', label: 'Дундговь' },
  { value: 'ZAVKHAN', label: 'Завхан' },
  { value: 'ORKHON', label: 'Орхон' },
  { value: 'UVURKHANGAI', label: 'Өвөрхангай' },
  { value: 'UMNUGOVI', label: 'Өмнөговь' },
  { value: 'SUKHBAATAR', label: 'Сүхбаатар' },
  { value: 'SELENGE', label: 'Сэлэнгэ' },
  { value: 'TUV', label: 'Төв' },
  { value: 'UVS', label: 'Увс' },
  { value: 'KHOVD', label: 'Ховд' },
  { value: 'KHUVSGUL', label: 'Хөвсгөл' },
  { value: 'KHENTII', label: 'Хэнтий' },
]

export const PROVINCE_VALUES = PROVINCES.map((p) => p.value)

export const DISTRICTS = [
  { value: 'BAGANUUR', label: 'Багануур' },
  { value: 'BAGAKHANGAI', label: 'Багахангай' },
  { value: 'BAYANGOL', label: 'Баянгол' },
  { value: 'BAYANZURKH', label: 'Баянзүрх' },
  { value: 'NALAIKH', label: 'Налайх' },
  { value: 'SONGINOKHAIRKHAN', label: 'Сонгинохайрхан' },
  { value: 'SUKHBAATAR', label: 'Сүхбаатар' },
  { value: 'KHANUUL', label: 'Хан-Уул' },
  { value: 'CHINGELTEI', label: 'Чингэлтэй' },
]

export const DISTRICT_VALUES = DISTRICTS.map((d) => d.value)

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

export const CATEGORY_KEYS = Object.keys(CATEGORIES)

// Exact-locale label from a schema object's labels map ({en,mn,zh,ru}); null if absent
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
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}
