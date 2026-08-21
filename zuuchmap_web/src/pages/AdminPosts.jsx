import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Clock, Eye } from 'lucide-react'
import { adminApi, postsApi } from '@/lib/api'
import { formatDate, getCategoryLabel, getPostCategory, getPostTitle } from '@/lib/utils'
import Button from '@/components/Button'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import CategoryBadge from '@/components/CategoryBadge'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import { toast } from 'sonner'
import TabBar from '@/components/TabBar'
import DensityToggle from '@/components/DensityToggle'
import { useTableDensity } from '@/hooks/useTableDensity'
import ConfirmModal from '@/components/ConfirmModal'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'

const TAB_KEYS = ['APPROVED', 'PENDING', 'REJECTED']

export default function AdminPosts() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('APPROVED')
  const [selected, setSelected] = useState(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [density, toggleDensity] = useTableDensity()
  const cellPad = density === 'compact' ? 'px-4 py-1.5' : 'px-4 py-3'
  const qc = useQueryClient()

  useEffect(() => setSelected(new Set()), [tab])

  const { data: pending = [], isLoading: pendingLoading, isError: pendingError, refetch: refetchPending } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: adminApi.getPending,
    enabled: tab === 'PENDING',
    staleTime: 30_000,
    select: (d) => Array.isArray(d) ? d : (d?.posts ?? d?.data ?? []),
  })

  const { data: allPosts = [], isLoading: allLoading, isError: allError, refetch: refetchAll } = useQuery({
    queryKey: ['posts', { approval_status: tab }],
    queryFn: () => postsApi.getAll({ approval_status: tab, limit: 50 }),
    enabled: tab !== 'PENDING',
    select: (d) => Array.isArray(d) ? d : (d?.items ?? []),
    staleTime: 30_000,
  })

  const approveMut = useMutation({
    mutationFn: adminApi.approve,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['posts-map'] })
      toast.success(t('admin.approveSuccess'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const bulkApproveMut = useMutation({
    mutationFn: (ids) => Promise.all(ids.map((id) => adminApi.approve(id))),
    onSuccess: () => {
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['posts-map'] })
      toast.success(t('admin.approveSuccess'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const posts = tab === 'PENDING' ? pending : allPosts
  const isLoading = tab === 'PENDING' ? pendingLoading : allLoading
  const isError = tab === 'PENDING' ? pendingError : allError
  const refetch = tab === 'PENDING' ? refetchPending : refetchAll
  const showSkeleton = useMinDisplayTime(isLoading)

  const allSelected = posts.length > 0 && posts.every((p) => selected.has(p.id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(posts.map((p) => p.id)))
    }
  }

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <PageHeader title={t('admin.postsTitle')} description={t(`status.${tab.toLowerCase()}`, { defaultValue: tab })} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <TabBar
          tabs={TAB_KEYS.map((key) => ({ key, label: t(`status.${key.toLowerCase()}`, { defaultValue: key }) }))}
          value={tab}
          onChange={setTab}
        />
        <DensityToggle density={density} onToggle={toggleDensity} />
      </div>
      {showSkeleton ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface2 rounded-card animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : posts.length === 0 ? (
        <EmptyState icon={Clock} title={t('posts.noMyPosts')} />
      ) : (
        <>
          {tab === 'PENDING' && selected.size > 0 && (
            <div className="flex items-center justify-between mb-3 px-4 py-2 bg-primary/10 border border-primary/20 rounded-card">
              <span className="text-sm text-text font-medium">{t('common.total', { count: selected.size })}</span>
              <Button
                size="sm"
                onClick={() => setConfirmBulk(true)}
                disabled={bulkApproveMut.isPending}
              >
                {t('admin.approve')} ({selected.size})
              </Button>
            </div>
          )}
          <div className="bg-surface border border-border/20 shadow-card rounded-card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border/50">
                  {tab === 'PENDING' && (
                    <th className="px-4 py-3 w-8 flex items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label={t('admin.selectAll')}
                        className="w-4 h-4 accent-primary cursor-pointer"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('nav.posts')}</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('posts.category')}</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('common.date')}</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('common.status')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className="border-b border-border/50 last:border-b-0 hover:bg-surface2/50 transition-colors">
                    {tab === 'PENDING' && (
                      <td className={`${cellPad} w-8 flex items-center justify-center`}>
                        <input
                          type="checkbox"
                          aria-label={`${t('common.select')}: ${getPostTitle(post, t)}`}
                          className="w-4 h-4 accent-primary cursor-pointer"
                          checked={selected.has(post.id)}
                          onChange={() => toggleSelect(post.id)}
                        />
                      </td>
                    )}
                    <td className={cellPad}>
                      <Link to={`/admin/posts/${post.id}`} className="text-text hover:text-primary-text transition-colors font-medium line-clamp-1">
                        {getPostTitle(post, t)}
                      </Link>
                    </td>
                    <td className={cellPad}><CategoryBadge category={getPostCategory(post)} /></td>
                    <td className={`${cellPad} text-muted`}>{formatDate(post.date_created)}</td>
                    <td className={cellPad}><StatusBadge status={post.approval_status} /></td>
                    <td className={cellPad}>
                      <div className="flex items-center gap-1.5 justify-end">
                        {tab === 'PENDING' && (
                          <button
                            onClick={() => approveMut.mutate(post.id)}
                            disabled={approveMut.isPending && approveMut.variables === post.id}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-btn text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                            title={t('admin.approve')}
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}
                        <Link to={`/admin/posts/${post.id}`} title={t('common.view')} aria-label={`${t('common.view')}: ${getPostTitle(post, t)}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-btn text-muted hover:text-primary-text hover:bg-primary/10 transition-colors">
                          <Eye size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
      <ConfirmModal
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        title={t('admin.approve')}
        message={t('admin.confirmBulkApprove', { count: selected.size })}
        confirmLabel={`${t('admin.approve')} (${selected.size})`}
        confirmVariant="primary"
        cancelLabel={t('common.cancel')}
        onConfirm={() => { bulkApproveMut.mutate(Array.from(selected)); setConfirmBulk(false) }}
        isPending={bulkApproveMut.isPending}
      />
    </div>
  )
}
