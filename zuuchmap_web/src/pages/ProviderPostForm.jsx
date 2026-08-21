import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useBlocker } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Upload, X, MapPin } from 'lucide-react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { postsApi, categoryApi } from '@/lib/api'
import { getCategoryLabel, getSubcategoryLabel, getFieldLabel, getOptionLabel, getPostCategory, getCategoryColor, categoryPin, getImageUrl, goBack, PRICE_UNITS, PROVINCES, DISTRICTS, apiErrorMessage } from '@/lib/utils'
import { useThemeStore } from '@/store'
import { toast } from 'sonner'
import Input from '../components/Input'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import ConfirmModal from '../components/ConfirmModal'
import ErrorState from '../components/ErrorState'

function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
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
      canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.82)
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

function DynamicField({ field, value, onChange, t }) {
  const lbl = <>{getFieldLabel(field, t)}{field.required && <span className="text-danger"> *</span>}</>
  if (field.type === 'select') return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{lbl}</label>
      <Input as="select" value={value} onChange={(e) => onChange(e.target.value)} required={field.required}>
        <option value="">{t('common.select')}</option>
        {field.options?.map((opt) => <option key={opt} value={opt}>{getOptionLabel(opt, t)}</option>)}
      </Input>
    </div>
  )
  if (field.type === 'textarea') return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{lbl}</label>
      <Input as="textarea" value={value} onChange={(e) => onChange(e.target.value)} required={field.required} rows={3}
        className="resize-none" />
    </div>
  )
  const inputType = field.type === 'phone' ? 'tel' : field.type === 'text' ? 'text' : field.type
  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{lbl}</label>
      <Input type={inputType} value={value} onChange={(e) => onChange(e.target.value)}
        required={field.required} />
    </div>
  )
}

export default function ProviderPostForm() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = Boolean(id)

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
  const setDirty = (v) => { dirtyRef.current = v; setDirtyState(v) }

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
        attributes: post.attributes ?? {},
      })
      setExistingImages(post.images ?? [])
    }
  }, [post])

  const mut = useMutation({
    mutationFn: (fd) => isEdit ? postsApi.update(id, fd) : postsApi.create(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-posts'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['posts-map'] })
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      if (isEdit) qc.invalidateQueries({ queryKey: ['post', String(id)] })
      toast.success(t(isEdit ? 'posts.updated' : 'posts.created'))
      setDirty(false)
      navigate('/provider/posts')
    },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('posts.createError'))),
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

  function set(key, val) { setDirty(true); setForm((f) => ({ ...f, [key]: val })) }
  function setAttr(key, val) { setDirty(true); setForm((f) => ({ ...f, attributes: { ...f.attributes, [key]: val } })) }

  function handleCategoryChange(val) {
    const next = schemas.find((s) => s.key === val)
    setForm((f) => ({
      ...f,
      category: val,
      subcategory: '',
      attributes: {},
      price_unit: next?.default_price_unit ?? f.price_unit ?? 'DAY',
    }))
  }

  async function addImages(files) {
    const compressed = await Promise.all(Array.from(files).map(compressImage))
    setDirty(true)
    setNewImages((prev) => [...prev, ...compressed])
  }
  function removeNew(i) { setDirty(true); setNewImages((prev) => prev.filter((_, idx) => idx !== i)) }
  function removeExisting(img) { setDirty(true); setExistingImages((prev) => prev.filter((x) => x !== img)) }

  function handleSubmit(e) {
    e.preventDefault()
    const fd = new FormData()
    const { attributes, ...rest } = form
    const normalized = { ...rest }
    // category is immutable after creation and is not part of UpdatePostDto —
    // the backend rejects unknown fields, so never send it on edit.
    if (isEdit) delete normalized.category
    if (normalized.website && !/^https?:\/\//i.test(normalized.website)) {
      normalized.website = `https://${normalized.website}`
    }
    Object.entries(normalized).forEach(([k, v]) => { if (v !== '') fd.append(k, v) })
    if (Object.keys(attributes).length > 0) fd.append('attributes', JSON.stringify(attributes))
    newImages.forEach((f) => fd.append('images', f))
    if (isEdit) fd.append('existingImages', JSON.stringify(existingImages))
    mut.mutate(fd)
  }

  const field = (label, key, type = 'text', { required: req, hint, ...extra } = {}) => (
    <div>
      <label className="text-xs text-muted block mb-1.5">
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
          <div key={i} className="h-12 bg-surface2 rounded-btn animate-pulse" />
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={schema?.subcategories?.length > 0 ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : undefined}>
          <div>
            <label className="text-xs text-muted block mb-1.5">{t('posts.category')} <span className="text-danger">*</span></label>
            <Input as="select" value={form.category} onChange={(e) => handleCategoryChange(e.target.value)} required>
              <option value="">{t('common.select')}</option>
              {schemas.filter((s) => s.active).map((s) => (
                <option key={s.key} value={s.key}>{getCategoryLabel(s.key, t, schemas)}</option>
              ))}
            </Input>
          </div>

          {schema?.subcategories?.length > 0 && (
            <div>
              <label className="text-xs text-muted block mb-1.5">{t('posts.subcategory')}</label>
              <Input as="select" value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)}>
                <option value="">{t('common.select')}</option>
                {schema.subcategories.map((sub) => (
                  <option key={sub.value} value={sub.value}>{getSubcategoryLabel(sub.value, t, schema)}</option>
                ))}
              </Input>
            </div>
          )}
        </div>

        {field(t('posts.title'), 'title', 'text', { required: true })}
        <div>
          <label className="text-xs text-muted block mb-1.5">{t('posts.details')}</label>
          <Input as="textarea" value={form.details} onChange={(e) => set('details', e.target.value)} rows={3} maxLength={2000} className="resize-none" />
          <p className="text-xs text-muted text-right mt-1">{form.details?.length ?? 0}/2000</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted block mb-1.5">{t('common.province')}</label>
            <Input as="select" value={form.province}
              onChange={(e) => { set('province', e.target.value); set('district', '') }}>
              <option value="">{t('common.select')}</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{t(`province.${p}`, { defaultValue: p })}</option>)}
            </Input>
          </div>
          {form.province === 'ULAANBAATAR' ? (
            <div>
              <label className="text-xs text-muted block mb-1.5">{t('common.district')}</label>
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
            <MapPin size={12} /> {t('posts.location')}
          </div>
          <div className="rounded-lg overflow-hidden border border-border/50">
            <LocationPicker lat={lat} lng={lng} color={getCategoryColor(form.category, schemas)} onChange={(la, lo) => setForm((f) => ({ ...f, latitude: String(la), longitude: String(lo) }))} />
          </div>
          <p className="text-xs text-muted mt-1">
            {lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : t('posts.clickToPin')}
          </p>
        </div>

        {schema?.has_price && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field(t('posts.priceAmount'), 'price_amount', 'number')}
            <div>
              <label className="text-xs text-muted block mb-1.5">{t('posts.priceUnit')}</label>
              <Input as="select" value={form.price_unit} onChange={(e) => set('price_unit', e.target.value)}>
                {PRICE_UNITS.map((u) => <option key={u} value={u}>{t(`priceUnit.${u.toLowerCase()}`, { defaultValue: u })}</option>)}
              </Input>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field(t('posts.contactPhone'), 'contact_phone', 'tel', { required: true, hint: t('posts.contactPhoneHint') })}
          {field(`${t('posts.contactEmail')}`, 'contact_email', 'email')}
        </div>
        {field(`${t('common.website')}`, 'website')}
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
            <label className="text-xs text-muted block mb-1.5">{t('common.status')}</label>
            <Input as="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {['ACTIVE', 'RENTED', 'EXPIRED'].map((s) => (
                <option key={s} value={s}>{t(`status.${s.toLowerCase()}`, { defaultValue: s })}</option>
              ))}
            </Input>
          </div>
        )}

        {schema?.fields?.map((f) => (
          <DynamicField key={f.key} field={f} value={form.attributes[f.key] ?? ''} onChange={(v) => setAttr(f.key, v)} t={t} />
        ))}

        <div>
          <label className="text-xs text-muted block mb-1.5">{t('posts.images')}</label>
          <p className="text-xs text-muted mb-2">{t('posts.imagesHint')}</p>
          {/* bg-black/60 + white on photography is the onMedia idiom — theme-independent by design. */}
          {existingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {existingImages.map((img) => (
                <div key={img} className="relative w-20 h-20 rounded-lg overflow-hidden">
                  <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeExisting(img)} aria-label={t('common.delete')} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {newImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {newImages.map((f, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden">
                  <img src={newImageUrls[i]} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeNew(i)} aria-label={t('common.delete')} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 border border-dashed border-border/50 rounded-btn text-sm text-muted hover:border-primary/40 hover:text-primary-text transition-colors">
            <Upload size={14} /> {t('posts.addImage')}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(e.target.files)} />
          </label>
        </div>

        <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-background/95 backdrop-blur border-t border-border/50">
          <Button type="submit" size="lg" disabled={mut.isPending} className="w-full">
            {mut.isPending ? t('posts.creating') : t(isEdit ? 'posts.update' : 'posts.create')}
          </Button>
        </div>
      </form>
    </div>
  )
}
