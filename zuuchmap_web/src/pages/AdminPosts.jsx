import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle, XCircle, Clock, Eye, ImageOff } from 'lucide-react'
import { adminApi, postsApi } from '@/lib/api'
import { formatDate, getPostCategory, getPostTitle, getImageUrl, hideBrokenImage, apiErrorMessage } from '@/lib/utils'
import Button from '@/components/Button'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import CategoryBadge from '@/components/CategoryBadge'
import EmptyState from '@/components/EmptyState'
import RejectReasonModal from '@/components/RejectReasonModal'
import Pagination from '@/components/Pagination'
import ErrorState from '@/components/ErrorState'
import { toast } from 'sonner'
import TabBar from '@/components/TabBar'
import DensityToggle from '@/components/DensityToggle'
import { useTableDensity } from '@/hooks/useTableDensity'
import ConfirmModal from '@/components/ConfirmModal'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'
import { useHotkeys } from '@/hooks/useHotkeys'
import KeyboardHints from '@/components/KeyboardHints'
import { useCategories } from '@/hooks/useCategories'
import { invalidatePostQueries } from '@/lib/queryClient'

const TAB_KEYS = ['APPROVED', 'PENDING', 'REJECTED']

const LIMIT = 50

export default function AdminPosts() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('APPROVED')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(new Set())
  const [rejectTarget, setRejectTarget] = useState(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [density, toggleDensity] = useTableDensity()
  const cellPad = density === 'compact' ? 'px-4 py-1.5' : 'px-4 py-3'
  const cellPadY = density === 'compact' ? 'py-1.5' : 'py-3'
  const qc = useQueryClient()
  const navigate = useNavigate()
  // Keyboard cursor over the pending queue: index into `posts`, -1 = none.
  const [cursor, setCursor] = useState(-1)
  const rowRefs = useRef([])

  useEffect(() => { setSelected(new Set()); setPage(1); setCursor(-1) }, [tab])

  // Schemas feed the reject dialog's "which field?" list.
  const { data: schemas = [] } = useCategories()

  // Both tabs are server-paged. They used to fetch one capped page and present
  // it as the whole list, so posts past the cap were simply unreachable.
  const { data: pendingData, isLoading: pendingLoading, isError: pendingError, refetch: refetchPending } = useQuery({
    queryKey: ['admin-pending', page],
    queryFn: () => adminApi.getPending({ page, limit: LIMIT }),
    enabled: tab === 'PENDING',
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    // The array branch keeps a client on the old build working against a new
    // server; it reports a total of one page, which is what it could show anyway.
    select: (d) => Array.isArray(d)
      ? { items: d, total: d.length }
      : { items: d?.items ?? [], total: d?.total ?? 0 },
  })
  const pending = pendingData?.items ?? []

  const { data: allData, isLoading: allLoading, isError: allError, refetch: refetchAll } = useQuery({
    queryKey: ['posts', { approval_status: tab, page }],
    queryFn: () => postsApi.getAll({ approval_status: tab, page, limit: LIMIT }),
    enabled: tab !== 'PENDING',
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    select: (d) => Array.isArray(d) ? { items: d, total: d.length } : { items: d?.items ?? [], total: d?.total ?? 0 },
  })
  const allPosts = allData?.items ?? []
  const total = tab === 'PENDING' ? (pendingData?.total ?? 0) : (allData?.total ?? 0)

  const approveMut = useMutation({
    mutationFn: adminApi.approve,
    onSuccess: () => {
      invalidatePostQueries(qc)
      toast.success(t('admin.approveSuccess'))
    },
    onError: () => toast.error(t('common.error')),
  })

  // Rejecting from the row. Approve was already one click here while reject
  // meant opening the post — so the careless action was cheap and the careful
  // one expensive. Same reason dialog the detail page uses.
  const rejectMut = useMutation({
    mutationFn: ({ id, reason, fieldKey }) => adminApi.reject(id, reason, fieldKey),
    onSuccess: () => {
      invalidatePostQueries(qc)
      setRejectTarget(null)
      toast.success(t('admin.rejectSuccess'))
    },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('admin.rejectError'))),
  })

  const bulkApproveMut = useMutation({
    // One request for the whole selection. Fanning out a PUT per post spent the
    // admin's entire rate-limit budget on a single "select all", and Promise.all
    // then reported total failure as soon as one of them 429'd — after the rest
    // had already been approved.
    mutationFn: (ids) => adminApi.approveMany(ids),
    onSuccess: (result) => {
      setSelected(new Set())
      invalidatePostQueries(qc)
      const approved = result?.approved?.length ?? 0
      const failed = result?.failed?.length ?? 0
      // Say what actually happened: a partial result is not a success and not
      // a failure, and the admin needs to know which it was.
      if (failed) toast.warning(t('admin.approvePartial', { approved, failed }))
      else toast.success(t('admin.approveSuccess'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const posts = tab === 'PENDING' ? pending : allPosts
  const isLoading = tab === 'PENDING' ? pendingLoading : allLoading
  const isError = tab === 'PENDING' ? pendingError : allError
  const refetch = tab === 'PENDING' ? refetchPending : refetchAll

  // Both tabs now report a real total, so the pager cannot overshoot on its own.
  // This still catches the case where approvals empty the last page underneath
  // the admin — otherwise they are left staring at "queue is clear" mid-queue.
  useEffect(() => {
    if (page > 1 && !isLoading && posts.length === 0) setPage((p) => p - 1)
  }, [page, isLoading, posts.length])
  const showSkeleton = useMinDisplayTime(isLoading)

  // Clamp rather than sync: approvals shorten the list under the cursor.
  const focusedIdx = Math.min(cursor, posts.length - 1)
  const focused = focusedIdx >= 0 ? posts[focusedIdx] : null
  const moveCursor = (dir) => {
    if (posts.length === 0) return
    setCursor((c) => {
      const cur = Math.min(c, posts.length - 1)
      return cur < 0 ? (dir > 0 ? 0 : posts.length - 1) : Math.min(posts.length - 1, Math.max(0, cur + dir))
    })
  }

  // Scrolling belongs here, not inside the setCursor updater: a state updater
  // has to be pure, and React runs it twice under StrictMode.
  useEffect(() => {
    if (focusedIdx < 0) return
    rowRefs.current[focusedIdx]?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx])
  const hotkeysOn = tab === 'PENDING' && !showSkeleton && !isError
  useHotkeys({
    j: () => moveCursor(1),
    k: () => moveCursor(-1),
    ArrowDown: () => moveCursor(1),
    ArrowUp: () => moveCursor(-1),
    Enter: () => focused && navigate(`/admin/posts/${focused.id}`, { state: { from: 'queue' } }),
    a: () => focused && !approveMut.isPending && approveMut.mutate(focused.id),
    r: () => focused && !rejectMut.isPending && setRejectTarget(focused),
    Escape: () => setCursor(-1),
  }, { enabled: hotkeysOn })

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
            <div key={i} className="h-16 skeleton rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : posts.length === 0 ? (
        <EmptyState icon={Clock} title={t('admin.queueEmpty')} description={t('admin.queueEmptyDesc')} />
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
          <div className="surface-card">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border/50">
                  {tab === 'PENDING' && (
                    <th className="w-12 py-3">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          aria-label={t('admin.selectAll')}
                          className="w-4 h-4 accent-primary cursor-pointer"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                        />
                      </div>
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
                {posts.map((post, i) => (
                  <tr
                    key={post.id}
                    ref={(el) => { rowRefs.current[i] = el }}
                    aria-selected={focusedIdx === i || undefined}
                    onClick={() => tab === 'PENDING' && setCursor(i)}
                    className={`border-b border-border/50 last:border-b-0 transition-colors ${focusedIdx === i
                      ? 'bg-primary/10 shadow-[inset_2px_0_0_var(--color-primary)] ring-1 ring-inset ring-primary/60'
                      : 'hover:bg-surface2/50'}`}
                  >
                    {tab === 'PENDING' && (
                      <td className={`${cellPadY} w-12`}>
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label={`${t('common.select')}: ${getPostTitle(post, t)}`}
                            className="w-4 h-4 accent-primary cursor-pointer"
                            checked={selected.has(post.id)}
                            onChange={() => toggleSelect(post.id)}
                          />
                        </div>
                      </td>
                    )}
                    <td className={cellPad}>
                      {/* The photo is what most rejections are actually about
                          ("unclear image" is the commonest reason), so it belongs
                          in the row rather than one navigation away. The provider
                          rides along because a first-time poster and someone with
                          three prior rejections deserve different scrutiny. */}
                      <div className="flex items-center gap-3 min-w-0">
                        {getImageUrl(post.images?.[0])
                          ? <img
                              src={getImageUrl(post.images[0])}
                              alt=""
                              loading="lazy"
                              onError={hideBrokenImage}
                              className="w-11 h-11 rounded-lg object-cover shrink-0 bg-surface2"
                            />
                          : <div className="w-11 h-11 rounded-lg bg-surface2 shrink-0 flex items-center justify-center" aria-hidden="true">
                              <ImageOff size={14} className="text-muted" />
                            </div>}
                        <div className="min-w-0">
                          <Link to={`/admin/posts/${post.id}`} state={{ from: 'queue' }} className="block text-text hover:text-primary-text transition-colors font-medium line-clamp-1">
                            {getPostTitle(post, t)}
                          </Link>
                          {post.user && (
                            <Link
                              to={`/admin/users/${post.user.id}`}
                              className="block text-xs text-muted hover:text-primary-text transition-colors line-clamp-1"
                            >
                              {post.user.given_name || post.user.phone_number || '—'}
                            </Link>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={cellPad}><CategoryBadge category={getPostCategory(post)} /></td>
                    <td className={`${cellPad} text-muted`}>{formatDate(post.date_created)}</td>
                    <td className={cellPad}><StatusBadge status={post.approval_status} /></td>
                    <td className={cellPad}>
                      <div className="flex items-center gap-1.5 justify-end">
                        {tab === 'PENDING' && (
                          <>
                            <button
                              onClick={() => approveMut.mutate(post.id)}
                              disabled={approveMut.isPending && approveMut.variables === post.id}
                              className="min-w-touch min-h-touch flex items-center justify-center rounded-btn text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                              title={t('admin.approve')}
                              aria-label={`${t('admin.approve')}: ${getPostTitle(post, t)}`}
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => setRejectTarget(post)}
                              disabled={rejectMut.isPending}
                              className="min-w-touch min-h-touch flex items-center justify-center rounded-btn text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                              title={t('admin.reject')}
                              aria-label={`${t('admin.reject')}: ${getPostTitle(post, t)}`}
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        <Link to={`/admin/posts/${post.id}`} state={{ from: 'queue' }} title={t('common.view')} aria-label={`${t('common.view')}: ${getPostTitle(post, t)}`} className="min-w-touch min-h-touch flex items-center justify-center rounded-btn text-muted hover:text-primary-text hover:bg-primary/10 transition-colors">
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
          <Pagination
            page={page}
            total={total}
            limit={LIMIT}
            onChange={setPage}
            labels={{ previous: t('common.previousPage'), next: t('common.nextPage'), page: t('common.page') }}
          />
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

      <RejectReasonModal
        key={rejectTarget?.id ?? 'none'}
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        isPending={rejectMut.isPending}
        title={rejectTarget ? `${t('admin.reject')}: ${getPostTitle(rejectTarget, t)}` : undefined}
        schema={rejectTarget ? schemas.find((s) => s.key === getPostCategory(rejectTarget)) : undefined}
        onConfirm={(reason, fieldKey) => rejectMut.mutate({ id: rejectTarget.id, reason, fieldKey })}
      />

      {hotkeysOn && posts.length > 0 && (
        <KeyboardHints hints={[
          { keys: ['J', 'K'], label: t('admin.hotkeyMove') },
          { keys: ['↵'], label: t('admin.hotkeyOpen') },
          { keys: ['A'], label: t('admin.hotkeyApprove') },
          { keys: ['R'], label: t('admin.hotkeyReject') },
          { keys: ['Esc'], label: t('admin.hotkeyClose') },
        ]} />
      )}
    </div>
  )
}
