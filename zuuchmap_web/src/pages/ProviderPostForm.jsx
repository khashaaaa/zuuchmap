import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useBlocker } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Upload, X, MapPin, AlertTriangle, XCircle } from 'lucide-react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { postsApi, categoryApi } from '@/lib/api'
import { getCategoryLabel, getSubcategoryLabel, getFieldLabel, getOptionLabel, getPostCategory, getCategoryColor, getImageUrl, goBack, PRICE_UNITS, PROVINCES, DISTRICTS, apiErrorMessage, hideBrokenImage, normalizeWebsiteUrl } from '@/lib/utils'
import { categoryPin } from '@/lib/mapPin'
import AlertBanner from '@/components/AlertBanner'
import { useThemeStore } from '@/store'
import { track } from '@/lib/analytics'
import { toast } from 'sonner'
import Input from '../components/Input'
import CollapsibleSection from '../components/CollapsibleSection'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import ConfirmModal from '../components/ConfirmModal'
import ErrorState from '../components/ErrorState'
import PostHealthRing from '../components/PostHealthRing'
import DraftResumeBanner from '../components/DraftResumeBanner'
import { computePostHealth } from '@/lib/postHealth'
import { loadDraft, saveDraft, clearDraft, listDrafts } from '@/lib/draftStorage'

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    // Every exit path must revoke the blob URL and settle the promise —
    // an undecodable file (HEIC on non-Safari, corrupt data) otherwise pins
    // the file's bytes for the page lifetime and hangs the caller forever.
    img.onload = () => {
      const MAX = 1920
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => blob
          ? resolve(new File([blob], file.name, { type: 'image/jpeg' }))
          : reject(new Error(`Could not compress ${file.name}`)),
        'image/jpeg', 0.82,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not decode ${file.name}`))
    }
    img.src = url
  })
}

const UB_CENTER = [47.8864, 106.9057]

function LocationPicker({ lat, lng, color, onChange }) {
  const { theme } = useThemeStore()
  function ClickHandler() {
    useMapEvents({ click: (e) => onChange(e.latlng.lat, e.latlng.lng) })
    return null
  }
  return (
    <MapContainer center={lat && lng ? [lat, lng] : UB_CENTER} zoom={lat && lng ? 14 : 10} style={{ height: '180px', width: '100%' }}>
      <TileLayer
        key={theme}
        url={`https://{s}.basemaps.cartocdn.com/${theme === 'dark' ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <ClickHandler />
      {lat && lng && <Marker position={[lat, lng]} icon={categoryPin(color)} />}
    </MapContainer>
  )
}

// Localized placeholder mirrors `labels`; the flat `placeholder` is the fallback.
const fieldPlaceholder = (field, lng) => field.placeholders?.[lng] ?? field.placeholder ?? ''

// A boolean starts false and a multiselect [] — seeding them with '' would hand
// the checkbox a string and break the chip group's Array checks.
export const buildAttributes = (schema, existing = {}) =>
  Object.fromEntries((schema?.fields ?? []).map((f) => [
    f.key,
    existing[f.key] ?? (f.type === 'boolean' ? false : f.type === 'multiselect' ? [] : ''),
  ]))

// The engine answers a missing required attribute with a code and the field
// keys. Without this the provider sees "MISSING_REQUIRED_ATTRIBUTES" and has no
// way to tell which box to fill.
function postErrorMessage(e, t, schema, fallback) {
  const data = e?.response?.data
  if (data?.message === 'MISSING_REQUIRED_ATTRIBUTES' && Array.isArray(data.fields)) {
    const names = data.fields
      .map((k) => {
        const def = schema?.fields?.find((f) => f.key === k)
        return def ? getFieldLabel(def, t) : k
      })
      .join(', ')
    return t('posts.missingRequired', { fields: names })
  }
  if (data?.message === 'INVALID_PRICE_UNIT') return t('posts.invalidPriceUnit')
  // The quota reply carries the limit and the plan it came from — a bare
  // "you have too many posts" leaves the provider guessing at both.
  if (data?.message === 'POST_QUOTA_EXCEEDED') return t('posts.quotaExceeded', { limit: data.limit })
  return apiErrorMessage(e, t, fallback)
}

// Post fields where an empty string is a meaningful instruction ("remove this")
// rather than a missing value. See the note in handleSubmit for why the rest of
// the form is excluded.
const CLEARABLE_POST_FIELDS = new Set([
  'details', 'address', 'contact_email', 'website', 'available_from', 'available_until',
  // The subcategory select offers a blank option, so deselecting is an intent
  // the UI invites; `update` assigns it with `??`, so `''` reaches the column.
  'subcategory',
])

function DynamicField({ field, value, onChange, t, lng }) {
  const unit = field.unit ? ` (${field.unit})` : ''
  // A boolean is always answered — the checkbox carries `false`, and the engine
  // accepts it (`validateRequiredAttributes` only rejects empty strings and
  // empty arrays). Marking one "required" promised a gate that nothing can
  // enforce, so the asterisk goes everywhere except there.
  const showRequired = field.required && field.type !== 'boolean'
  const lbl = <>{getFieldLabel(field, t)}{unit}{showRequired && <span className="text-danger"> *</span>}</>

  if (field.type === 'select') return (
    <div>
      <label className="field-label">{lbl}</label>
      <Input as="select" value={value} onChange={(e) => onChange(e.target.value)} required={field.required}>
        <option value="">{t('common.select')}</option>
        {field.options?.map((opt) => <option key={opt} value={opt}>{getOptionLabel(opt, t)}</option>)}
      </Input>
    </div>
  )

  if (field.type === 'boolean') return (
    <div>
      <label className="field-label">{lbl}</label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-primary" />
        <span className="text-sm text-text">{value === true ? t('common.yes') : t('common.no')}</span>
      </label>
    </div>
  )

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
    return (
      <div>
        <label className="field-label">{lbl}</label>
        <div className="flex flex-wrap gap-2">
          {field.options?.map((opt) => (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              aria-pressed={selected.includes(opt)}
              className={`px-3 py-1.5 text-xs rounded-btn border transition-colors ${
                selected.includes(opt)
                  ? 'bg-primary text-on-primary border-primary'
                  : 'border-border/40 text-muted hover:text-text'
              }`}>
              {getOptionLabel(opt, t)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'textarea') return (
    <div>
      <label className="field-label">{lbl}</label>
      <Input as="textarea" value={value} onChange={(e) => onChange(e.target.value)} required={field.required} rows={3}
        placeholder={fieldPlaceholder(field, lng)} className="resize-none" />
    </div>
  )

  const inputType = field.type === 'phone' ? 'tel' : field.type === 'text' ? 'text' : field.type
  return (
    <div>
      <label className="field-label">{lbl}</label>
      <Input type={inputType} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={fieldPlaceholder(field, lng)} required={field.required} />
    </div>
  )
}

// Section card — same idiom as ProviderCompany's detail card, so the form
// reads as a sequence of concerns instead of one unbroken column of controls.
function FormSection({ title, children }) {
  return (
    <section className="bg-surface border border-border/20 shadow-card rounded-card p-5 space-y-4">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {children}
    </section>
  )
}

export default function ProviderPostForm() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = Boolean(id)

  // Funnel entry: only the create form counts, and only once per open —
  // the [isEdit] dep keeps re-renders from re-firing it.
  useEffect(() => {
    if (!isEdit) track('post.create.started')
  }, [isEdit])

  const { data: post, isLoading: postLoading, isError: postError, refetch: refetchPost } = useQuery({
    queryKey: ['post', id],
    queryFn: () => postsApi.getOne(id),
    enabled: isEdit,
  })

  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })

  const [form, setForm] = useState({
    category: '',
    title: '',
    details: '',
    province: '',
    district: '',
    address: '',
    price_amount: '',
    price_unit: 'DAY',
    contact_phone: '',
    contact_email: '',
    website: '',
    subcategory: '',
    latitude: '',
    longitude: '',
    available_from: '',
    available_until: '',
    status: 'ACTIVE',
    attributes: {},
  })
  const [newImages, setNewImages] = useState([])
  const [newImageUrls, setNewImageUrls] = useState([])
  const [existingImages, setExistingImages] = useState([])
  // Mirrored into a ref so the navigation blocker sees the value synchronously
  // (onSuccess flips it false and navigates in the same tick).
  const [dirty, setDirtyState] = useState(false)
  const dirtyRef = useRef(false)
  // Whether this post was live before the edit — the re-moderation notice only
  // means something for a listing that was actually in browse.
  const wasApproved = useRef(false)
  const setDirty = (v) => { dirtyRef.current = v; setDirtyState(v) }
  // A stored draft waiting for a decision (create mode only). While it is on
  // screen, autosave holds off so typing cannot overwrite the thing on offer.
  const [pendingDraft, setPendingDraft] = useState(() => (isEdit ? null : listDrafts()[0] ?? null))
  // The form field a rejection points at — scrolled to and lit once, on edit.
  const [highlightKey, setHighlightKey] = useState(null)

  useEffect(() => {
    const urls = newImages.map((f) => URL.createObjectURL(f))
    setNewImageUrls(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [newImages])

  const schema = useMemo(
    () => schemas.find((s) => s.key === form.category),
    [schemas, form.category]
  )

  useEffect(() => {
    if (post) {
      setForm({
        category: getPostCategory(post) ?? '',
        title: post.title ?? '',
        details: post.details ?? '',
        province: post.province ?? '',
        district: post.district ?? '',
        address: post.address ?? '',
        price_amount: post.price_amount ?? '',
        price_unit: post.price_unit ?? 'DAY',
        contact_phone: post.contact_phone ?? '',
        contact_email: post.contact_email ?? '',
        website: post.website ?? '',
        subcategory: post.subcategory ?? '',
        latitude: post.latitude ?? '',
        longitude: post.longitude ?? '',
        available_from: post.available_from ? post.available_from.slice(0, 10) : '',
        available_until: post.available_until ? post.available_until.slice(0, 10) : '',
        status: post.status ?? 'ACTIVE',
        attributes: buildAttributes(schemas.find((s) => s.key === post.category), post.attributes ?? {}),
      })
      setExistingImages(post.images ?? [])
      wasApproved.current = post.approval_status === 'APPROVED'
    }
  }, [post])

  // 0-100 while the photos go up; null once there is nothing left to report.
  const [uploadPct, setUploadPct] = useState(null)

  const mut = useMutation({
    mutationFn: (fd) => {
      setUploadPct(0)
      const onProgress = (pct) => setUploadPct(pct >= 100 ? null : pct)
      return isEdit ? postsApi.update(id, fd, onProgress) : postsApi.create(fd, onProgress)
    },
    onSettled: () => setUploadPct(null),
    onSuccess: (saved) => {
      if (!isEdit) track('post.create.submitted', { post_id: saved?.id, category: form.category })
      qc.invalidateQueries({ queryKey: ['my-posts'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['posts-map'] })
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      if (isEdit) qc.invalidateQueries({ queryKey: ['post', String(id)] })
      // A content edit sends an approved post back to moderation, so it leaves
      // browse the moment it is saved. Read the outcome off the response rather
      // than guessing which fields counted as content, and say so — "Post
      // updated" on a listing that has just vanished reads as a bug.
      if (isEdit && saved?.approval_status === 'PENDING' && wasApproved.current) {
        toast.warning(t('posts.updatedPending'), { duration: 6000 })
      } else {
        toast.success(t(isEdit ? 'posts.updated' : 'posts.created'))
      }
      if (!isEdit) clearDraft(form.category)
      setDirty(false)
      navigate('/provider/posts')
    },
    onError: (e) => toast.error(postErrorMessage(e, t, schema, t('posts.createError'))),
  })

  useEffect(() => {
    if (!dirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // In-app navigation guard — catches sidebar links and back, not just the
  // browser-level unload the effect above handles.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirtyRef.current && currentLocation.pathname !== nextLocation.pathname
  )

  // Draft autosave — text and attributes only, one slot per category, 800ms
  // after the last keystroke. Files are not serialisable and blob URLs die
  // with the page, so images are deliberately left out.
  useEffect(() => {
    if (isEdit || !dirty || !form.category || pendingDraft) return
    const timer = setTimeout(() => saveDraft(form.category, form), 800)
    return () => clearTimeout(timer)
  }, [form, dirty, isEdit, pendingDraft])

  function resumeDraft() {
    if (!pendingDraft) return
    const draftSchema = schemas.find((s) => s.key === pendingDraft.category)
    setForm({ ...pendingDraft.form, category: pendingDraft.category, attributes: buildAttributes(draftSchema, pendingDraft.form.attributes ?? {}) })
    setPendingDraft(null)
    setDirty(true)
    toast.info(t('provider.draftRestored'))
  }
  function discardDraft() {
    clearDraft(pendingDraft?.category)
    setPendingDraft(null)
  }

  // Rejection with a named field: bring the provider straight to it. Base
  // fields map to their own wrappers; anything else is a schema key.
  const rejectedField = isEdit && post?.approval_status === 'REJECTED' ? (post.rejection_field ?? null) : null
  useEffect(() => {
    if (!rejectedField || !schema) return
    // Deferred a tick so the highlighted wrapper is in the DOM after the
    // schema-dependent sections have rendered.
    const show = setTimeout(() => {
      const el = document.getElementById(`field-${rejectedField}`)
      if (!el) return
      setHighlightKey(rejectedField)
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      el.querySelector('input, select, textarea')?.focus({ preventScroll: true })
    }, 0)
    const hide = setTimeout(() => setHighlightKey(null), 4000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [rejectedField, schema])

  // Wrapper for any field a rejection can point at. The ring fades out on its
  // own; the danger border stays until the provider edits the field.
  const fieldWrap = (key) => ({
    id: `field-${key}`,
    className: `rounded-lg transition-shadow duration-500 motion-reduce:transition-none ${
      highlightKey === key ? 'ring-2 ring-danger/60 ring-offset-2 ring-offset-surface' : ''
    } ${rejectedField === key ? 'border-l-2 border-danger pl-3 -ml-3' : ''}`,
  })
  const rejectedFieldLabel = () => {
    const base = { title: t('posts.title'), details: t('posts.details'), price: t('posts.priceAmount'), images: t('posts.images'), location: t('posts.location') }
    if (base[rejectedField]) return base[rejectedField]
    const def = schema?.fields?.find((f) => f.key === rejectedField)
    return def ? getFieldLabel(def, t) : rejectedField
  }

  const health = useMemo(() => (schema ? computePostHealth({
    imageCount: existingImages.length + newImages.length,
    attributes: form.attributes,
    details: form.details,
    price: form.price_amount,
    schema,
  }) : null), [schema, existingImages.length, newImages.length, form.attributes, form.details, form.price_amount])

  function set(key, val) { setDirty(true); setForm((f) => ({ ...f, [key]: val })) }
  function setAttr(key, val) { setDirty(true); setForm((f) => ({ ...f, attributes: { ...f.attributes, [key]: val } })) }

  function handleCategoryChange(val) {
    const next = schemas.find((s) => s.key === val)
    if (!isEdit) {
      const draft = loadDraft(val)
      setPendingDraft(draft ? { category: val, ...draft } : null)
    }
    setForm((f) => ({
      ...f,
      category: val,
      subcategory: '',
      attributes: buildAttributes(next),
      price_unit: next?.default_price_unit ?? f.price_unit ?? 'DAY',
    }))
  }

  async function addImages(files) {
    // allSettled: one undecodable file must not discard the whole selection.
    const results = await Promise.allSettled(Array.from(files).map(compressImage))
    const compressed = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
    if (results.some((r) => r.status === 'rejected')) toast.error(t('posts.imageCompressFailed'))
    if (!compressed.length) return
    setDirty(true)
    setNewImages((prev) => [...prev, ...compressed])
  }
  function removeNew(i) { setDirty(true); setNewImages((prev) => prev.filter((_, idx) => idx !== i)) }
  function removeExisting(img) { setDirty(true); setExistingImages((prev) => prev.filter((x) => x !== img)) }

  function handleSubmit(e) {
    e.preventDefault()
    setHighlightKey(null)
    // Chip groups are buttons, not form controls, so the browser's own required
    // check cannot see them. The engine does reject an empty required
    // multiselect (MISSING_REQUIRED_ATTRIBUTES) — catching it here saves the
    // provider a round trip that also re-uploads every photo.
    const missing = (schema?.fields ?? []).filter(
      (f) => f.required && f.type === 'multiselect' && !(form.attributes[f.key]?.length > 0),
    )
    if (missing.length > 0) {
      setHighlightKey(missing[0].key)
      document.getElementById(`field-${missing[0].key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.error(t('posts.missingRequired', { fields: missing.map((f) => getFieldLabel(f, t)).join(', ') }))
      return
    }
    const fd = new FormData()
    const { attributes, ...rest } = form
    const normalized = { ...rest }
    // category is immutable after creation and is not part of UpdatePostDto —
    // the backend rejects unknown fields, so never send it on edit.
    if (isEdit) delete normalized.category
    if (normalized.website) normalized.website = normalizeWebsiteUrl(normalized.website)
    // A blank is only sent for fields where the engine reads it as "clear this".
    // `UpdatePostDto` coerces price/lat/lng with `@Type(() => Number)`, so a
    // blank there would store 0 rather than nothing, and province/district are
    // `@IsIn` enums that reject one outright. Everything in CLEARABLE is a plain
    // optional string the service assigns with `??`, so `''` genuinely empties
    // the column — the availability dates are even documented that way. Without
    // this, a cleared box on the web was dropped from the body entirely and the
    // old value survived a save that reported success.
    Object.entries(normalized).forEach(([k, v]) => {
      if (v !== '' || CLEARABLE_POST_FIELDS.has(k)) fd.append(k, v)
    })
    if (Object.keys(attributes).length > 0) fd.append('attributes', JSON.stringify(attributes))
    newImages.forEach((f) => fd.append('images', f))
    if (isEdit) fd.append('existingImages', JSON.stringify(existingImages))
    mut.mutate(fd)
  }

  const field = (label, key, type = 'text', { required: req, hint, wrapKey, ...extra } = {}) => (
    <div {...(wrapKey ? fieldWrap(wrapKey) : {})}>
      <label className="field-label">
        {label}{req && <span className="text-danger"> *</span>}
      </label>
      <Input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} required={req} {...extra} />
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  )

  const lat = form.latitude ? Number(form.latitude) : null
  const lng = form.longitude ? Number(form.longitude) : null

  // Never render an editable-but-empty form: typing before the post arrives
  // gets clobbered by the fill effect, and submitting a blank form would PATCH
  // empty values over the real post.
  if (isEdit && postLoading) return (
    <div className="max-w-3xl">
      <PageHeader title={t('posts.edit')} onBack={() => goBack(navigate, '/provider/posts')} />
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 skeleton rounded-btn" />
        ))}
      </div>
    </div>
  )
  if (isEdit && postError) return (
    <div className="max-w-3xl">
      <PageHeader title={t('posts.edit')} onBack={() => goBack(navigate, '/provider/posts')} />
      <ErrorState onRetry={refetchPost} />
    </div>
  )

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t(isEdit ? 'posts.edit' : 'posts.create')}
        onBack={() => goBack(navigate, '/provider/posts')}
      />
      <ConfirmModal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title={t('posts.unsavedChangesTitle')}
        message={t('posts.unsavedChangesConfirm')}
        confirmLabel={t('posts.leaveWithoutSaving')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => blocker.proceed?.()}
      />
      {/* Said before the edit, not only after it: a provider changing a price on
          a live listing is entitled to know it will leave browse until an admin
          looks at it again. Operational fields (rental status, availability
          dates) do not trigger this, which is why the wording is about content. */}
      {isEdit && post?.approval_status === 'APPROVED' && (
        <AlertBanner variant="warning" icon={AlertTriangle} className="mb-4">
          {t('posts.editNeedsApproval')}
        </AlertBanner>
      )}
      {/* Rejected: the reason, and — when the admin named a field — where to
          look. Clicking the field name jumps there again. */}
      {isEdit && post?.approval_status === 'REJECTED' && post.rejection_reason && (
        <AlertBanner variant="danger" icon={XCircle} title={t('admin.rejectReason')} className="mb-4">
          {post.rejection_reason}
          {rejectedField && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => { setHighlightKey(rejectedField); document.getElementById(`field-${rejectedField}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
                className="underline underline-offset-2 font-semibold hover:opacity-80"
              >
                {t('posts.rejectedFieldFix', { field: rejectedFieldLabel() })}
              </button>
            </>
          )}
        </AlertBanner>
      )}
      {!isEdit && pendingDraft && (
        <DraftResumeBanner
          savedAt={pendingDraft.savedAt}
          onResume={resumeDraft}
          onDiscard={discardDraft}
          className="mb-4"
        />
      )}
      {health && (
        <div className="bg-surface border border-border/20 shadow-card rounded-card px-5 py-4 mb-4">
          <PostHealthRing health={health} size="md" showHint />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormSection title={t('posts.basicInfo')}>
          <div className={schema?.subcategories?.length > 0 ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : undefined}>
            <div>
              <label className="field-label">{t('posts.category')} <span className="text-danger">*</span></label>
              <Input as="select" value={form.category} onChange={(e) => handleCategoryChange(e.target.value)} required>
                <option value="">{t('common.select')}</option>
                {schemas.filter((s) => s.active).map((s) => (
                  <option key={s.key} value={s.key}>{getCategoryLabel(s.key, t, schemas)}</option>
                ))}
              </Input>
            </div>

            {schema?.subcategories?.length > 0 && (
              <div>
                <label className="field-label">{t('posts.subcategory')}</label>
                <Input as="select" value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)}>
                  <option value="">{t('common.select')}</option>
                  {schema.subcategories.map((sub) => (
                    <option key={sub.value} value={sub.value}>{getSubcategoryLabel(sub.value, t, schema)}</option>
                  ))}
                </Input>
              </div>
            )}
          </div>

          {field(t('posts.title'), 'title', 'text', { required: true, wrapKey: 'title' })}
          <div {...fieldWrap('details')}>
            <label className="field-label">{t('posts.details')}</label>
            <Input as="textarea" value={form.details} onChange={(e) => set('details', e.target.value)} rows={3} maxLength={2000} className="resize-none" />
            <p className="text-xs text-muted text-right mt-1">{form.details?.length ?? 0}/2000</p>
          </div>
        </FormSection>

        <FormSection title={t('posts.images')}>
          <div {...fieldWrap('images')} className={`${fieldWrap('images').className} space-y-4`}>
          <p className="text-xs text-muted">{t('posts.imagesHint')}</p>
          {/* bg-black/60 + white on photography is the onMedia idiom — theme-independent by design. */}
          {existingImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {existingImages.map((img) => (
                <div key={img} className="relative w-20 h-20 rounded-lg overflow-hidden">
                  <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" onError={hideBrokenImage} />
                  <button type="button" onClick={() => removeExisting(img)} aria-label={t('common.delete')} className="absolute top-1 right-1 bg-black/60 text-white rounded-full min-w-[28px] min-h-[28px] flex items-center justify-center">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {newImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {newImages.map((f, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden">
                  <img src={newImageUrls[i]} alt="" className="w-full h-full object-cover" onError={hideBrokenImage} />
                  <button type="button" onClick={() => removeNew(i)} aria-label={t('common.delete')} className="absolute top-1 right-1 bg-black/60 text-white rounded-full min-w-[28px] min-h-[28px] flex items-center justify-center">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 border border-dashed border-border/50 rounded-btn text-sm text-muted hover:border-primary/40 hover:text-primary-text transition-colors">
            <Upload size={14} /> {t('posts.addImage')}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
              addImages(e.target.files)
              // Without this, removing an image and re-picking the same file
              // silently does nothing — the value never changed.
              e.target.value = ''
            }} />
          </label>
          </div>
        </FormSection>

        <FormSection title={t('posts.location')}>
          <div {...fieldWrap('location')} className={`${fieldWrap('location').className} space-y-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">{t('common.province')}</label>
              <Input as="select" value={form.province}
                onChange={(e) => { set('province', e.target.value); set('district', '') }}>
                <option value="">{t('common.select')}</option>
                {PROVINCES.map((p) => <option key={p} value={p}>{t(`province.${p}`, { defaultValue: p })}</option>)}
              </Input>
            </div>
            {form.province === 'ULAANBAATAR' ? (
              <div>
                <label className="field-label">{t('common.district')}</label>
                <Input as="select" value={form.district} onChange={(e) => set('district', e.target.value)}>
                  <option value="">{t('common.select')}</option>
                  {DISTRICTS.map((d) => <option key={d} value={d}>{t(`district.${d}`, { defaultValue: d })}</option>)}
                </Input>
              </div>
            ) : <div />}
          </div>
          {field(t('common.address'), 'address')}

          <div>
            <div className="text-xs text-muted mb-1.5 flex items-center gap-1">
              <MapPin size={12} /> {t('posts.pinOnMap')}
            </div>
            <div className="rounded-lg overflow-hidden border border-border/50">
              <LocationPicker lat={lat} lng={lng} color={getCategoryColor(form.category, schemas)} onChange={(la, lo) => setForm((f) => ({ ...f, latitude: String(la), longitude: String(lo) }))} />
            </div>
            <p className="text-xs text-muted mt-1">
              {lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : t('posts.clickToPin')}
            </p>
          </div>
          </div>
        </FormSection>

        {schema?.fields?.length > 0 && (
          <FormSection title={t('posts.categoryDetails')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {schema.fields.filter((f) => (f.group ?? 'core') === 'core').map((f) => (
                <div key={f.key} {...fieldWrap(f.key)} className={`${fieldWrap(f.key).className} ${f.type === 'textarea' || f.type === 'multiselect' ? 'sm:col-span-2' : ''}`}>
                  <DynamicField field={f} value={form.attributes[f.key] ?? ''} onChange={(v) => setAttr(f.key, v)} t={t} lng={i18n.language} />
                </div>
              ))}
            </div>
            {/* Open when the disclosure holds something the form will refuse to
                submit without. A closed <details> hides its content, so a
                `required` control inside it is not focusable and the browser
                blocks submit with a console warning and nothing on screen —
                the submit button just stops responding. An admin can produce
                that with one checkbox in /admin/categories. */}
            {schema.fields.some((f) => f.group === 'details') && (
              <CollapsibleSection
                title={t('posts.moreDetails')}
                defaultOpen={schema.fields.some((f) => f.group === 'details' && f.required)}
                variant="bare"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {schema.fields.filter((f) => f.group === 'details').map((f) => (
                    <div key={f.key} {...fieldWrap(f.key)} className={`${fieldWrap(f.key).className} ${f.type === 'textarea' || f.type === 'multiselect' ? 'sm:col-span-2' : ''}`}>
                      <DynamicField field={f} value={form.attributes[f.key] ?? ''} onChange={(v) => setAttr(f.key, v)} t={t} lng={i18n.language} />
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </FormSection>
        )}

        {(schema?.has_price || schema?.has_availability_dates || schema?.has_rental_status) && (
          <FormSection title={t('posts.pricing')}>
            {schema?.has_price && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field(t('posts.priceAmount'), 'price_amount', 'text', { format: 'currency', wrapKey: 'price' })}
                <div>
                  <label className="field-label">{t('posts.priceUnit')}</label>
                  <Input as="select" value={form.price_unit} onChange={(e) => set('price_unit', e.target.value)}>
                    {PRICE_UNITS.map((u) => <option key={u} value={u}>{t(`priceUnit.${u.toLowerCase()}`, { defaultValue: u })}</option>)}
                  </Input>
                </div>
              </div>
            )}
            {schema?.has_availability_dates && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field(`${t('posts.availableFrom')}`, 'available_from', 'date')}
                {field(`${t('posts.availableUntil')}`, 'available_until', 'date')}
              </div>
            )}
            {/* Rental status lets a provider mark a listing rented/paused without
                editing content — mirrors the app's StatusSection. */}
            {schema?.has_rental_status && (
              <div>
                <label className="field-label">{t('common.status')}</label>
                <Input as="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {['ACTIVE', 'RENTED', 'EXPIRED'].map((s) => (
                    <option key={s} value={s}>{t(`status.${s.toLowerCase()}`, { defaultValue: s })}</option>
                  ))}
                </Input>
              </div>
            )}
          </FormSection>
        )}

        <FormSection title={t('posts.contactInfo')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field(t('posts.contactPhone'), 'contact_phone', 'tel', { required: true, hint: t('posts.contactPhoneHint') })}
            {field(`${t('posts.contactEmail')}`, 'contact_email', 'email')}
          </div>
          {field(`${t('common.website')}`, 'website')}
        </FormSection>

        <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-background/95 backdrop-blur border-t border-border/50">
          <Button type="submit" size="lg" disabled={mut.isPending} className="w-full relative overflow-hidden">
            {/* Photos dominate the request, so the percentage is a real answer to
                "is this stuck?" — the label alone sat unchanged for a minute. */}
            {mut.isPending && uploadPct !== null && (
              <span
                className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-200"
                style={{ width: `${uploadPct}%` }}
                aria-hidden="true"
              />
            )}
            <span className="relative">
              {mut.isPending
                ? (uploadPct !== null ? t('posts.uploadingPct', { pct: uploadPct }) : t('posts.creating'))
                : t(isEdit ? 'posts.update' : 'posts.create')}
            </span>
          </Button>
        </div>
      </form>
    </div>
  )
}
