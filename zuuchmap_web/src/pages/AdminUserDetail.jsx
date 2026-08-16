import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Trash2, Phone, Mail, MapPin, Calendar } from 'lucide-react'
import { usersApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import UserAvatar from '@/components/UserAvatar'
import { useAuthStore } from '@/store'
import ConfirmModal from '@/components/ConfirmModal'
import PageHeader from '@/components/PageHeader'
import { toast } from 'sonner'

export default function AdminUserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user: currentUser } = useAuthStore()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersApi.getById(id),
  })

  const deleteMut = useMutation({
    mutationFn: () => usersApi.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success(t('admin.userDeleted'))
      navigate('/admin/users', { replace: true })
    },
    onError: (e) => toast.error(e.response?.data?.message || t('common.error')),
  })

  if (isLoading) return (
    <div className="max-w-md space-y-4">
      <div className="h-8 bg-surface2 rounded w-24 animate-pulse" />
      <div className="h-48 bg-surface2 rounded-card animate-pulse" />
    </div>
  )

  if (!user) return <p className="text-muted">{t('common.noData')}</p>

  const details = [
    [Phone, user.phone_number],
    [Mail, user.email],
    [MapPin, user.address],
    [Calendar, user.date_created ? `${t('profile.memberSince')}: ${formatDate(user.date_created)}` : null],
  ].filter(([, v]) => v)

  return (
    <div className="max-w-md">
      <PageHeader title={t('admin.userDetail')} onBack={() => navigate(-1)} />

      <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-4">
          <UserAvatar src={user.profile_picture} name={user.given_name} size="lg" />
          <div>
            <p className="font-semibold text-text text-lg">{user.given_name ?? '—'}</p>
            {user.parent_name && <p className="text-sm text-muted">{user.parent_name}</p>}
            <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-md border ${
              user.type === 'PROVIDER' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-surface2 text-muted border-border/50'
            }`}>
              {user.type === 'PROVIDER' ? t('onboarding.provider') : user.type === 'CUSTOMER' ? t('onboarding.customer') : '—'}
            </span>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-border/50">
          {details.map(([Icon, value]) => (
            <div key={value} className="flex items-center gap-2 text-sm text-muted">
              <Icon size={14} className="shrink-0" />
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {(user.is_admin !== true || user.id === currentUser?.id) && (
        <div className="mt-4">
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-danger border border-danger/30 rounded-btn hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={14} /> {t('admin.deleteUser')}
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('admin.deleteUser')}
        message={user.given_name ?? user.phone_number}
        confirmLabel={t('common.delete')}
        loadingLabel={t('common.loading')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { deleteMut.mutate(); setConfirmDelete(false) }}
        isPending={deleteMut.isPending}
      />
    </div>
  )
}
