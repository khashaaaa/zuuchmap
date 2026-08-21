import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Building } from 'lucide-react'
import { companyApi, usersApi } from '@/lib/api'
import { useAuthStore as useStore } from '@/store'
import { getCompanyLogoUrl, apiErrorMessage } from '@/lib/utils'
import Button from '@/components/Button'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import { toast } from 'sonner'

export default function ProviderCompany() {
  const { t } = useTranslation()
  const user = useStore((s) => s.user)
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', phone_number: '', email: '', address: '', website: '' })
  const [logo, setLogo] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)

  useEffect(() => {
    if (!logo) return setLogoUrl(null)
    const url = URL.createObjectURL(logo)
    setLogoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [logo])

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: usersApi.getProfile,
    staleTime: 30_000,
  })

  const companyId = profile?.company?.id ?? user?.company?.id

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

  const createMut = useMutation({
    mutationFn: (fd) => companyApi.create(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-company'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      setEditing(false)
      toast.success(t('company.created'))
    },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('common.error'))),
  })

  const updateMut = useMutation({
    mutationFn: (fd) => companyApi.update(company.id, fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-company'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      setEditing(false)
      toast.success(t('company.updated'))
    },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('common.error'))),
  })

  function handleSubmit(e) {
    e.preventDefault()
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v) })
    if (logo) fd.append('logo', logo)
    company ? updateMut.mutate(fd) : createMut.mutate(fd)
  }

  if (isLoading) return (
    <div>
      <PageHeader title={t('company.title')} />
      <div className="h-48 bg-surface2 rounded-card animate-pulse" />
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
    const details = [
      [t('common.phone'), company.phone_number],
      [t('common.email'), company.email],
      [t('common.address'), company.address],
      [t('common.website'), company.website],
    ]
    return (
      <div className="max-w-md">
        <PageHeader title={t('company.title')} action={<Button variant="outline" onClick={() => setEditing(true)}>{t('common.edit')}</Button>} />
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 space-y-3">
          {company.logo && <img src={getCompanyLogoUrl(company.logo)} alt="" className="w-16 h-16 rounded-lg object-cover" />}
          <div>
            <p className="font-semibold text-text text-lg">{company.name}</p>
            {company.description && <p className="text-sm text-muted mt-1">{company.description}</p>}
          </div>
          {details.map(([l, v]) => v && (
            <div key={l}><p className="text-xs text-muted">{l}</p><p className="text-sm text-text">{v}</p></div>
          ))}
        </div>
      </div>
    )
  }

  const formFields = [
    [t('company.name'), 'name', true],
    [t('company.description'), 'description'],
    [t('common.phone'), 'phone_number'],
    [t('common.email'), 'email'],
    [t('common.address'), 'address'],
    [t('common.website'), 'website'],
  ]

  return (
    <div className="max-w-md">
      <PageHeader title={t(company ? 'company.editTitle' : 'company.register')} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="relative cursor-pointer">
            <div className="w-16 h-16 rounded-lg bg-surface2 border border-border/50 overflow-hidden flex items-center justify-center">
              {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-cover" /> :
               company?.logo ? <img src={getCompanyLogoUrl(company.logo)} alt="" className="w-full h-full object-cover" /> :
               <Building size={20} className="text-muted" />}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setLogo(e.target.files[0])} />
          </label>
          <span className="text-xs text-muted">{t('company.logo')}</span>
        </div>
        {formFields.map(([label, key, req]) => (
          <div key={key}>
            <label className="text-xs text-muted block mb-1.5">
              {label}{req && <span className="text-danger"> *</span>}
            </label>
            <Input type="text" value={form[key]} required={req} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
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
