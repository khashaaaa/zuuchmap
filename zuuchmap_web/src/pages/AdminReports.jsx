import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Flag, Star } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Button from '@/components/Button'
import { reportsApi } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

const TABS = ['OPEN', 'RESOLVED', 'DISMISSED']
const PAGE_SIZE = 50

/**
 * The moderation queue for reports users filed on live listings.
 *
 * Oldest first, the same drain-the-tail rule the pending-post queue uses: a
 * newest-first queue starves whatever nobody got to. Paged: a single
 * 50-row fetch left everything past the oldest fifty unreachable.
 *
 * A report is about a listing or a review. `subject` is what was filed
 * against as it read then, so a report still reads after the owner deleted
 * the thing — which no longer deletes the report.
 */
export default function AdminReports() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [tab, setTab] = useState('OPEN')
  const [resolution, setResolution] = useState({})

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['reports', tab],
    queryFn: ({ pageParam }) => reportsApi.list({ status: tab, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined,
  })

  const resolveMut = useMutation({
    mutationFn: ({ id, status, note, takeDown }) => reportsApi.resolve(id, status, note, takeDown),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] })
      qc.invalidateQueries({ queryKey: ['reports', 'count'] })
      qc.invalidateQueries({ queryKey: ['reviews'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: () => toast.error(t('common.error')),
  })

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t('report.queue')}
        description={tab === 'OPEN' ? t('report.openCount', { count: total }) : undefined}
        icon={Flag}
      />

      <div className="flex gap-2 mb-4" role="tablist">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors ${
              tab === value ? 'bg-primary text-on-primary' : 'bg-surface2 text-text hover:bg-border/20'
            }`}
          >
            {t(`report.status.${value}`)}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-card bg-surface2 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Flag} title={t('report.queueEmpty')} />
      ) : (
        <ul className="space-y-3">
          {items.map((report) => (
            <li key={report.id} className="rounded-card bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text">{t(`report.reasons.${report.reason}`)}</p>
                  {report.kind === 'REVIEW' ? (
                    <div className="text-sm text-text">
                      <span className="text-xs font-semibold text-muted mr-1.5">{t('report.kindReview')}</span>
                      {report.review ? (
                        <>
                          <span className="inline-flex items-center gap-0.5 align-middle mr-1.5">
                            {report.review.rating}<Star size={11} className="text-warning fill-warning" />
                          </span>
                          <span className="break-words">{report.review.comment || '—'}</span>
                        </>
                      ) : (
                        <span className="text-muted">{t('report.subjectGone')} · {report.subject || '—'}</span>
                      )}
                    </div>
                  ) : report.post ? (
                    <Link
                      to={`/admin/posts/${report.post.id}`}
                      className="text-sm text-primary-text hover:underline truncate block"
                    >
                      #{report.post.id} · {report.post.title || '—'}
                    </Link>
                  ) : (
                    <p className="text-sm text-muted truncate">{t('report.subjectGone')} · {report.subject || '—'}</p>
                  )}
                </div>
                <span className="text-xs text-muted shrink-0">{formatDateTime(report.date_created)}</span>
              </div>

              {report.detail && (
                <p className="text-sm text-text/80 mt-2 whitespace-pre-wrap break-words">{report.detail}</p>
              )}

              <p className="text-xs text-muted mt-2">
                {t('report.reporter')}: {report.reporter?.phone_number ?? '—'}
                {' · '}{t('report.against')}: {report.owner?.phone_number ?? '—'}
              </p>

              {tab === 'OPEN' && (
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    value={resolution[report.id] ?? ''}
                    onChange={(e) => setResolution((r) => ({ ...r, [report.id]: e.target.value }))}
                    placeholder={t('report.resolutionPlaceholder')}
                    maxLength={500}
                    aria-label={t('report.resolutionPlaceholder')}
                    className="flex-1 bg-surface2 border border-transparent rounded-btn px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-primary"
                  />
                  <div className="flex flex-wrap gap-2">
                    {(report.post || report.review) && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => resolveMut.mutate({ id: report.id, status: 'RESOLVED', note: resolution[report.id], takeDown: true })}
                        disabled={resolveMut.isPending}
                      >
                        {report.post ? t('report.takeDownPost') : t('report.takeDownReview')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => resolveMut.mutate({ id: report.id, status: 'RESOLVED', note: resolution[report.id] })}
                      disabled={resolveMut.isPending}
                    >
                      {t('report.resolve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => resolveMut.mutate({ id: report.id, status: 'DISMISSED', note: resolution[report.id] })}
                      disabled={resolveMut.isPending}
                    >
                      {t('report.dismiss')}
                    </Button>
                  </div>
                </div>
              )}

              {report.resolution && tab !== 'OPEN' && (
                <p className="text-xs text-muted mt-2 italic">{report.resolution}</p>
              )}
            </li>
          ))}
          {hasNextPage && (
            <li className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {t('report.loadMore')}
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
