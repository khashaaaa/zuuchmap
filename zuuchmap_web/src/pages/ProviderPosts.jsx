import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, FileText, Timer, Eye, Heart, CalendarRange } from 'lucide-react'
import { postsApi } from '@/lib/api'
import { getPostCategory, getPostTitle, getImageUrl, hideBrokenImage, formatDate } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import CategoryBadge from '@/components/CategoryBadge'
import StatusBadge from '@/components/StatusBadge'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import ConfirmModal from '@/components/ConfirmModal'
import TabBar from '@/components/TabBar'
import Button from '@/components/Button'
import DensityToggle from '@/components/DensityToggle'
import { useTableDensity } from '@/hooks/useTableDensity'
import { toast } from 'sonner'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'
import { useApiMutation } from '@/hooks/useApiMutation'
import { invalidatePostQueries } from '@/lib/queryClient'

const TAB_STATUSES = {
  ALL: null,
  PENDING: ['PENDING'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
}

export default function ProviderPosts() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [tab, setTab] = useState('ALL')
  const [density, toggleDensity] = useTableDensity()
  const cellPad = density === 'compact' ? 'px-4 py-1.5' : 'px-4 py-3'

  function expiryLabel(post) {
    if (!post.expires_at) return null
    const days = Math.ceil((new Date(post.expires_at) - Date.now()) / 86400000)
    if (days < 0) return { text: t('posts.expired'), cls: 'text-danger' }
    if (days === 0) return { text: t('posts.expiresToday'), cls: 'text-warning' }
    if (days <= 5) return { text: t('posts.expiresIn', { days }), cls: 'text-warning' }
    return { text: t('posts.expiresIn', { days }), cls: 'text-muted' }
  }

  const { data: posts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
  })
  const showSkeleton = useMinDisplayTime(isLoading)

  // Attention stats (views / saves / booking requests) per post. Non-blocking:
  // the list renders without them and the columns fill in when they arrive.
  //
  // Fetched unconditionally: the same payload carries the plan and the quota,
  // and a provider with no posts yet is exactly who benefits from being told
  // what the limit is before they run into it.
  const { data: myStats } = useQuery({
    queryKey: ['my-post-stats'],
    queryFn: postsApi.getMyStats,
    staleTime: 60_000,
  })
  const statsById = new Map((myStats?.posts ?? []).map((s) => [s.id, s]))
  const plan = myStats?.plan
  const quotaUsed = plan ? Math.min(plan.posts_active / Math.max(plan.post_limit, 1), 1) : 0
  const atQuota = plan && plan.posts_active >= plan.post_limit

  const deleteMut = useApiMutation({
    mutationFn: postsApi.remove,
    onSuccess: () => { invalidatePostQueries(qc); toast.success(t('posts.deleted')) },
  })

  const counts = {
    ALL: posts.length,
    PENDING: posts.filter((p) => p.approval_status === 'PENDING').length,
    APPROVED: posts.filter((p) => p.approval_status === 'APPROVED').length,
    REJECTED: posts.filter((p) => p.approval_status === 'REJECTED').length,
  }
  const statuses = TAB_STATUSES[tab]
  const filtered = statuses ? posts.filter((p) => statuses.includes(p.approval_status)) : posts

  return (
    <div>
      <PageHeader
        title={t('posts.myPosts')}
        description={t('posts.total', { count: posts.length })}
        action={
          <Button to="/provider/posts/new">
            <Plus size={15} /> {t('posts.add')}
          </Button>
        }
      />

      {/* Plan and quota. The engine refuses the next post at the limit, so the
          provider needs to see the number before the form does. */}
      {plan && (
        <div className="bg-surface border border-border/20 shadow-card rounded-card px-4 py-3 mb-4 max-w-lg">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                plan.name === 'PROVIDER'
                  ? 'bg-primary/10 text-primary-text border-primary/20'
                  : 'text-muted border-border/50'
              }`}>
                {plan.name === 'PROVIDER' ? t('admin.planProvider') : t('admin.planFree')}
              </span>
              {plan.expires_at && (
                <span className="text-xs text-muted">
                  {t('admin.planExpires')} {formatDate(plan.expires_at)}
                </span>
              )}
            </div>
            <span className={`text-xs tabular-nums ${atQuota ? 'text-warning font-medium' : 'text-muted'}`}>
              {t('posts.quotaUsed', { used: plan.posts_active, limit: plan.post_limit })}
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-surface2 overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-full transition-all ${atQuota ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${quotaUsed * 100}%` }}
            />
          </div>
          {atQuota && <p className="text-xs text-warning mt-1.5">{t('posts.quotaFull')}</p>}
        </div>
      )}

      {posts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <TabBar
            tabs={[
              { key: 'ALL', label: `${t('status.all')} (${counts.ALL})` },
              { key: 'PENDING', label: `${t('status.pending')} (${counts.PENDING})` },
              { key: 'APPROVED', label: `${t('status.approved')} (${counts.APPROVED})` },
              { key: 'REJECTED', label: `${t('status.rejected')} (${counts.REJECTED})` },
            ]}
            value={tab}
            onChange={setTab}
          />
          {/* Row density is a table concern; the phone layout has no rows. */}
          <div className="hidden lg:block">
            <DensityToggle density={density} onToggle={toggleDensity} />
          </div>
        </div>
      )}

      {showSkeleton ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 skeleton rounded-card" />)}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('posts.noMyPosts')}
          action={
            <Button to="/provider/posts/new">
              {t('posts.createFirst')}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title={t('common.noData')} />
      ) : (
        <>
        {/* Phones and tablets get cards, not a 640px-wide table in a horizontal scroller —

            that pushed Edit and Delete, the only two actions on the screen,
            entirely off the right edge with nothing to say they were there. */}
        <div className="lg:hidden space-y-3">
          {filtered.map((post) => {
            const expiry = expiryLabel(post)
            const stat = statsById.get(post.id)
            return (
              <div key={post.id} className="surface-card p-3">
                <Link to={`/provider/posts/${post.id}`} className="flex items-start gap-3 group">
                  {post.images?.[0] ? (
                    <img src={getImageUrl(post.images[0])} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" onError={hideBrokenImage} />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-surface2 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-text group-hover:text-primary-text transition-colors font-medium line-clamp-2 leading-tight">
                      {getPostTitle(post, t)}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <CategoryBadge category={getPostCategory(post)} />
                      <StatusBadge status={post.approval_status} />
                    </div>
                    {post.approval_status === 'REJECTED' && post.rejection_reason && (
                      <p className="text-xs text-danger mt-1.5 line-clamp-2">{post.rejection_reason}</p>
                    )}
                  </div>
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-3 text-xs text-muted tabular-nums">
                    {stat && (
                      <>
                        <span className="flex items-center gap-1" title={t('posts.stats.views')}><Eye size={12} aria-hidden="true" /> {stat.views}</span>
                        <span className="flex items-center gap-1" title={t('posts.stats.saves')}><Heart size={12} aria-hidden="true" /> {stat.likes}</span>
                        <span className="flex items-center gap-1" title={t('posts.stats.requests')}><CalendarRange size={12} aria-hidden="true" /> {stat.bookings_pending + stat.bookings_accepted}</span>
                      </>
                    )}
                    {expiry && <span className={`flex items-center gap-1 ${expiry.cls}`}><Timer size={12} /> {expiry.text}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Link
                      to={`/provider/posts/${post.id}/edit`}
                      aria-label={t('posts.edit')}
                      className="min-w-touch min-h-touch flex items-center justify-center rounded-btn border border-border/50 text-muted hover:text-primary-text hover:bg-primary/10 transition-colors"
                    >
                      <Pencil size={15} />
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(post)}
                      aria-label={t('common.delete')}
                      className="min-w-touch min-h-touch flex items-center justify-center rounded-btn border border-border/50 text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="surface-card hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('nav.posts')}</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('posts.category')}</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('common.status')}</th>
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('posts.statAttention')}</th>
                  {/* The table's natural width is ~820px; beside the sidebar at
                      1024 it has 736, which put the edit/delete column off-screen.
                      Expiry is the column the phone cards already fold away. */}
                  <th className="text-left px-4 py-3 text-xs text-muted font-medium hidden xl:table-cell">{t('posts.expires')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((post) => {
                  const expiry = expiryLabel(post)
                  const stat = statsById.get(post.id)
                  return (
                    <tr key={post.id} className="border-b border-border/50 last:border-b-0 hover:bg-surface2/50 transition-colors">
                      <td className={cellPad}>
                        <Link to={`/provider/posts/${post.id}`} className="flex items-center gap-3 group">
                          {post.images?.[0] ? (
                            <img src={getImageUrl(post.images[0])} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={hideBrokenImage} />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-surface2 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-text group-hover:text-primary-text transition-colors font-medium line-clamp-1">
                              {getPostTitle(post, t)}
                            </p>
                            {post.approval_status === 'REJECTED' && post.rejection_reason && (
                              <p className="text-xs text-danger line-clamp-1">{post.rejection_reason}</p>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className={cellPad}><CategoryBadge category={getPostCategory(post)} /></td>
                      <td className={cellPad}><StatusBadge status={post.approval_status} /></td>
                      <td className={cellPad}>
                        {stat ? (
                          <span className="flex items-center gap-2.5 text-xs text-muted tabular-nums whitespace-nowrap">
                            <span className="flex items-center gap-1" title={t('posts.stats.views')}><Eye size={11} aria-hidden="true" /> {stat.views}</span>
                            <span className="flex items-center gap-1" title={t('posts.stats.saves')}><Heart size={11} aria-hidden="true" /> {stat.likes}</span>
                            <span className="flex items-center gap-1" title={t('posts.stats.requests')}><CalendarRange size={11} aria-hidden="true" /> {stat.bookings_pending + stat.bookings_accepted}</span>
                          </span>
                        ) : <span className="text-muted text-xs">—</span>}
                      </td>
                      <td className={`${cellPad} hidden xl:table-cell`}>
                        {expiry ? (

                          <span className={`flex items-center gap-1 text-xs ${expiry.cls}`}>
                            <Timer size={11} /> {expiry.text}
                          </span>
                        ) : <span className="text-muted text-xs">—</span>}
                      </td>
                      <td className={cellPad}>
                        <div className="flex items-center gap-1.5 justify-end">
                          <Link
                            to={`/provider/posts/${post.id}/edit`}
                            title={t('posts.edit')}
                            className="min-w-touch min-h-touch flex items-center justify-center rounded-btn text-muted hover:text-primary-text hover:bg-primary/10 transition-colors"
                          >
                            <Pencil size={14} />
                          </Link>
                          <button
                            onClick={() => setDeleteTarget(post)}
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                            className="min-w-touch min-h-touch flex items-center justify-center rounded-btn text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('posts.deleteConfirmTitle')}
        message={t('posts.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { deleteMut.mutate(deleteTarget.id); setDeleteTarget(null) }}
        isPending={deleteMut.isPending}
      />
    </div>
  )
}
