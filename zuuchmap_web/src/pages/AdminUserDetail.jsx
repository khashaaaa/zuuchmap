import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Trash2, Phone, Mail, MapPin, Calendar } from 'lucide-react'
import { usersApi } from '@/lib/api'
import { formatDate, goBack, apiErrorMessage } from '@/lib/utils'
import UserAvatar from '@/components/UserAvatar'
import { useAuthStore } from '@/store'
import ConfirmModal from '@/components/ConfirmModal'
import Button from '@/components/Button'
import { TypeBadge } from '@/components/StatusBadge'
import PageHeader from '@/components/PageHeader'
import ErrorState from '@/components/ErrorState'
import { toast } from 'sonner'

export default function AdminUserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user: currentUser } = useAuthStore()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: user, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersApi.getById(id),
  })

  const deleteMut = useMutation({
    mutationFn: () => usersApi.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      toast.success(t('admin.userDeleted'))
      navigate('/admin/users', { replace: true })
    },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('common.error'))),
  })

  if (isLoading) return (
    <div className="max-w-md">
      <PageHeader title={t('admin.userDetail')} onBack={() => goBack(navigate, '/admin/users')} />
      <div className="h-48 bg-surface2 rounded-card animate-pulse" />
    </div>
  )

  if (isError && error?.response?.status !== 404) return (
    <div className="max-w-md">
      <PageHeader title={t('admin.userDetail')} onBack={() => goBack(navigate, '/admin/users')} />
      <ErrorState onRetry={refetch} />
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
      <PageHeader title={t('admin.userDetail')} onBack={() => goBack(navigate, '/admin/users')} />

      <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-4">
          <UserAvatar src={user.profile_picture} name={user.given_name} size="lg" />
          <div>
            <p className="font-semibold text-text text-lg">{user.given_name ?? '—'}</p>
            {user.parent_name && <p className="text-sm text-muted">{user.parent_name}</p>}
            <span className="inline-block mt-1"><TypeBadge type={user.type} /></span>
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
          <Button variant="danger-outline" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /> {t('admin.deleteUser')}
          </Button>
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
