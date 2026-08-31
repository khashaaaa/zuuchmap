import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Building } from 'lucide-react'
import { companyApi } from '@/lib/api'
import { useProfile } from '@/hooks/useProfile'
import { useApiMutation } from '@/hooks/useApiMutation'
import { getCompanyLogoUrl, hideBrokenImage, normalizeWebsiteUrl, telHref, validateEmail, validatePhone, validateRequired } from '@/lib/utils'
import Button from '@/components/Button'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import { toast } from 'sonner'
import ImageCropModal from '@/components/ImageCropModal'

export default function ProviderCompany() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', phone_number: '', email: '', address: '', website: '' })
  const [logo, setLogo] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [pendingLogo, setPendingLogo] = useState(null)

  useEffect(() => {
    if (!logo) return setLogoUrl(null)
    const url = URL.createObjectURL(logo)
    setLogoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [logo])

  const { data: profile } = useProfile()

  const companyId = profile?.company?.id

  const { data: company, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-company'],
    queryFn: () => companyApi.getById(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (company) {
      setForm({ name: company.name ?? '', description: company.description ?? '', phone_number: company.phone_number ?? '', email: company.email ?? '', address: company.address ?? '', website: company.website ?? '' })
    }
  }, [company])

  const createMut = useApiMutation({
    mutationFn: (fd) => companyApi.create(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-company'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      setEditing(false)
      toast.success(t('company.created'))
    },
  })

  const updateMut = useApiMutation({
    mutationFn: (fd) => companyApi.update(company.id, fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-company'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      setEditing(false)
      toast.success(t('company.updated'))
    },
  })

  // Same rules the app applies in ProviderCompany/EditProfileScreen — the company
  // DTOs have no server-side validation, so whatever passes here is what lands in
  // the database. Errors surface as a toast rather than inline: the web idiom,
  // and the app's inline field errors are a phone-form affordance.
  function validate() {
    if (!validateRequired(form.name)) return t('company.nameRequired')
    if (form.email && !validateEmail(form.email)) return t('common.invalidEmail')
    if (form.phone_number && !validatePhone(form.phone_number)) return t('common.invalidPhone')
    return null
  }

  function handleSubmit(e) {
    e.preventDefault()
    const error = validate()
    if (error) return toast.error(error)
    // Normalise before send, exactly as the app does on blur, so a bare
    // "example.mn" is stored as a followable link rather than rejected.
    const payload = { ...form, website: normalizeWebsiteUrl(form.website) }
    const fd = new FormData()
    // Blanks are sent so a field can actually be emptied. Every key on this
    // form is a bounded optional string on both company DTOs (`email` carries
    // a `@ValidateIf` precisely so `''` stays legal), and `normalizeWebsiteUrl`
    // returns `''` untouched — so a cleared box reaches the column as cleared
    // instead of silently keeping its old value behind a success toast.
    Object.entries(payload).forEach(([k, v]) => fd.append(k, v ?? ''))
    if (logo) fd.append('logo', logo)
    company ? updateMut.mutate(fd) : createMut.mutate(fd)
  }

  if (isLoading) return (
    <div>
      <PageHeader title={t('company.title')} />
      <div className="h-48 skeleton rounded-card" />
    </div>
  )

  // Never tell a provider their company isn't registered because we failed to ask.
  if (isError && error?.response?.status !== 404 && !editing) {
    return (
      <div>
        <PageHeader title={t('company.title')} />
        <ErrorState onRetry={refetch} />
      </div>
    )
  }

  if (!company && !editing) {
    return (
      <div>
        <PageHeader title={t('company.title')} />
        <EmptyState
          icon={Building}
          title={t('company.notRegistered')}
          action={<Button onClick={() => setEditing(true)}>{t('company.register')}</Button>}
        />
      </div>
    )
  }

  if (!editing && company) {
    // A phone number you cannot tap and a website you cannot click are the two
    // things a visitor actually came for.
    const href = (kind, v) =>
      kind === 'phone' ? telHref(v) :
      kind === 'email' ? `mailto:${v}` :
      kind === 'website' ? normalizeWebsiteUrl(v) : null
    const details = [
      [t('common.phone'), company.phone_number, 'phone'],
      [t('common.email'), company.email, 'email'],
      [t('common.address'), company.address, null],
      [t('common.website'), company.website, 'website'],
    ]
    return (
      <div className="max-w-md">
        <PageHeader title={t('company.title')} action={<Button variant="outline" onClick={() => setEditing(true)}>{t('common.edit')}</Button>} />
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 space-y-3">
          {company.logo && <img src={getCompanyLogoUrl(company.logo)} alt="" className="w-16 h-16 rounded-lg object-cover" onError={hideBrokenImage} />}
          <div>
            <p className="font-semibold text-text text-lg">{company.name}</p>
            {company.description && <p className="text-sm text-muted mt-1">{company.description}</p>}
          </div>
          {details.map(([l, v, kind]) => v && (
            <div key={l}>
              <p className="text-xs text-muted">{l}</p>
              {kind ? (
                <a href={href(kind, v)} className="text-sm text-primary-text hover:underline break-all"
                  {...(kind === 'website' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{v}</a>
              ) : (
                <p className="text-sm text-text">{v}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // [label, key, required, inputType] — the type drives the mobile keyboard and
  // the browser's built-in validation, both of which a bare "text" throws away.
  const formFields = [
    [t('company.name'), 'name', true, 'text'],
    [t('company.description'), 'description', false, 'textarea'],
    [t('common.phone'), 'phone_number', false, 'tel'],
    [t('common.email'), 'email', false, 'email'],
    [t('common.address'), 'address', false, 'text'],
    // 'text' + inputMode, not type="url": the browser would reject the bare
    // "example.mn" that normalizeWebsiteUrl turns into a valid link on submit.
    [t('common.website'), 'website', false, 'text', 'url'],
  ]

  return (
    <div className="max-w-md">
      <PageHeader title={t(company ? 'company.editTitle' : 'company.register')} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="relative cursor-pointer">
            <div className="w-16 h-16 rounded-lg bg-surface2 border border-border/50 overflow-hidden flex items-center justify-center">
              {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-cover" onError={hideBrokenImage} /> :
               company?.logo ? <img src={getCompanyLogoUrl(company.logo)} alt="" className="w-full h-full object-cover" onError={hideBrokenImage} /> :
               <Building size={20} className="text-muted" />}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              setPendingLogo(e.target.files[0] ?? null)
              // Same file re-picked is not a value change and fires no event —
              // reset so the picker keeps working. Matches AvatarPicker.
              e.target.value = ''
            }} />
          </label>
          <span className="text-xs text-muted">{t('company.logo')}</span>
        </div>
        <ImageCropModal file={pendingLogo} onDone={(f) => { setPendingLogo(null); setLogo(f) }} onCancel={() => setPendingLogo(null)} />
        {formFields.map(([label, key, req, inputType, mode]) => (
          <div key={key}>
            <label className="field-label">
              {label}{req && <span className="text-danger"> *</span>}
            </label>
            {inputType === 'textarea' ? (
              <Input as="textarea" rows={3} className="resize-none" value={form[key]} required={req}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            ) : (
              <Input type={inputType} inputMode={mode} value={form[key]} required={req}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            )}
          </div>
        ))}
        <div className="flex gap-2">
          {company && <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>}
          <Button type="submit" size="lg" disabled={createMut.isPending || updateMut.isPending} className="flex-1">
            {createMut.isPending || updateMut.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
