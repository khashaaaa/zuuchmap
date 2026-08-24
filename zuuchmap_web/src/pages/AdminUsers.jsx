import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Trash2, Users, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usersApi } from '@/lib/api'
import { formatDate, apiErrorMessage } from '@/lib/utils'
import UserAvatar from '@/components/UserAvatar'
import Input from '@/components/Input'
import { useAuthStore } from '@/store'
import PageHeader from '@/components/PageHeader'
import SearchBar from '@/components/SearchBar'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import ConfirmModal from '@/components/ConfirmModal'
import { TypeBadge } from '@/components/StatusBadge'
import DensityToggle from '@/components/DensityToggle'
import { useTableDensity } from '@/hooks/useTableDensity'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'
import { toast } from 'sonner'

export default function AdminUsers() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuthStore()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [density, toggleDensity] = useTableDensity()
  const cellPad = density === 'compact' ? 'px-4 py-1.5' : 'px-4 py-3'
  const qc = useQueryClient()

  const { data: users = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: usersApi.getAll,
  })
  const showSkeleton = useMinDisplayTime(isLoading)

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch = !search || u.phone_number?.includes(search) || u.given_name?.toLowerCase().includes(search.toLowerCase())
      const matchType = !typeFilter || u.type === typeFilter
      return matchSearch && matchType
    })
  }, [users, search, typeFilter])

  // Plan is granted here, not bought here — Phase 1 fulfils subscriptions
  // manually. The server clamps months and re-derives entitlement on read.
  //
  // The duration is a choice rather than a hardcoded single month: the endpoint
  // has always taken 1–24, and renewing early extends from the existing expiry
  // instead of burning the remaining time.
  const planMut = useMutation({
    mutationFn: ({ id, plan, months }) => usersApi.setPlan(id, plan, months),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success(t('admin.planUpdated')) },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('common.error'))),
  })

  const deleteMut = useMutation({
    mutationFn: usersApi.deleteUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }); toast.success(t('admin.userDeleted')) },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('common.error'))),
  })

  return (
    <div>
      <PageHeader title={t('admin.users')} description={t('common.total', { count: users.length })} />
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SearchBar
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.searchUsers')}
        />
        <Input as="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto min-w-[130px]">
          <option value="">{t('admin.allTypes')}</option>
          <option value="PROVIDER">{t('onboarding.provider')}</option>
          <option value="CUSTOMER">{t('onboarding.customer')}</option>
        </Input>
        <DensityToggle density={density} onToggle={toggleDensity} className="ml-auto" />
      </div>
      {showSkeleton ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title={t('admin.noUsers')} description={t('admin.noUsersDesc')} />
      ) : (
        <div className="bg-surface border border-border/20 shadow-card rounded-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('profile.title')}</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium hidden sm:table-cell">{t('common.phone')}</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('onboarding.title')}</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('admin.plan')}</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium hidden sm:table-cell">{t('common.date')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-border/50 last:border-b-0 hover:bg-surface2/50 transition-colors">
                  <td className={cellPad}>
                    <Link to={`/admin/users/${user.id}`} className="flex items-center gap-3 hover:text-primary-text transition-colors group">
                      <UserAvatar src={user.profile_picture} name={user.given_name} size="sm" />
                      <span className="text-text group-hover:text-primary-text">{user.given_name ?? '—'}</span>
                      <ChevronRight size={12} className="text-muted opacity-40 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className={`${cellPad} text-muted hidden sm:table-cell`}>{user.phone_number}</td>
                  <td className={cellPad}>
                    <TypeBadge type={user.type} />
                  </td>
                  <td className={cellPad}>
                    {user.plan === 'PROVIDER' ? (
                      <div className="flex flex-col gap-1 items-start">
                        <button
                          onClick={() => planMut.mutate({ id: user.id, plan: 'FREE', months: 1 })}
                          disabled={planMut.isPending}
                          title={t('admin.planFree')}
                          className="px-2 py-0.5 rounded-md text-xs font-medium border bg-primary/10 text-primary-text border-primary/20 transition-colors disabled:opacity-50"
                        >
                          {t('admin.planProvider')}
                        </button>
                        {/* Without the date, a granted plan is a word with no
                            end — the admin cannot tell renewal from expiry. */}
                        <span className="text-[11px] text-muted whitespace-nowrap">
                          {user.plan_expires_at
                            ? `${t('admin.planExpires')} ${formatDate(user.plan_expires_at)}`
                            : t('admin.planNoExpiry')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        {[1, 3, 12].map((months) => (
                          <button
                            key={months}
                            onClick={() => planMut.mutate({ id: user.id, plan: 'PROVIDER', months })}
                            disabled={planMut.isPending}
                            title={t('admin.planProvider')}
                            className="px-2 py-0.5 rounded-md text-xs font-medium border text-muted border-border/50 hover:text-text hover:border-primary/40 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {t('admin.planMonths', { months })}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={`${cellPad} text-muted hidden sm:table-cell`}>{formatDate(user.date_created)}</td>
                  <td className={cellPad}>
                    {(user.is_admin !== true && user.id !== currentUser?.id) && (
                      <button
                        onClick={() => setDeleteTarget(user)}
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 rounded-btn transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t('admin.deleteUser')}
        message={deleteTarget?.given_name ?? deleteTarget?.phone_number}
        confirmLabel={t('common.delete')}
        loadingLabel={t('common.loading')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { deleteMut.mutate(deleteTarget.id); setDeleteTarget(null) }}
        isPending={deleteMut.isPending}
      />
    </div>
  )
}
