import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { analyticsApi, categoryApi } from '@/lib/api'
import { getCategoryLabel } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import ErrorState from '@/components/ErrorState'
import StatCard from '@/components/StatCard'
import { LineChart, ColumnChart, BarList, Funnel, DataTable } from '@/components/Charts'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'

const RANGES = [7, 30, 90]

function Panel({ title, hint, children, action }) {
  return (
    <section className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function AdminAnalytics() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [showTables, setShowTables] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-summary', days],
    queryFn: () => analyticsApi.summary(days),
    staleTime: 60_000,
  })
  const showSkeleton = useMinDisplayTime(isLoading)

  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 5 * 60_000,
  })

  const totals = data?.totals ?? {}
  const series = data?.series ?? {}
  const funnel = data?.funnel ?? {}

  const categories = (data?.breakdowns?.categories ?? []).map((c) => ({
    key: c.key,
    label: getCategoryLabel(c.key, t, schemas),
    value: Number(c.posts),
  }))

  const provinces = (data?.breakdowns?.provinces ?? []).map((p) => ({
    key: p.key,
    label: p.key === 'unknown' ? t('analytics.unknownProvince') : p.key,
    value: Number(p.posts),
  }))

  const postVolume = (series.posts ?? []).map((row) => ({
    day: row.day,
    value: Number(row.total),
  }))

  const funnelStages = [
    { key: 'visited', label: t('analytics.stageVisited') },
    { key: 'viewed_post', label: t('analytics.stageViewedPost') },
    { key: 'searched', label: t('analytics.stageSearched') },
    { key: 'started_auth', label: t('analytics.stageStartedAuth') },
    { key: 'verified', label: t('analytics.stageVerified') },
    { key: 'submitted_post', label: t('analytics.stageSubmittedPost') },
    { key: 'requested_booking', label: t('analytics.stageRequestedBooking') },
  ].map((s) => ({ ...s, value: Number(funnel[s.key] ?? 0) }))

  if (showSkeleton) {
    return (
      <div>
        <PageHeader title={t('analytics.title')} />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 skeleton rounded-card" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div>
        <PageHeader title={t('analytics.title')} />
        <ErrorState onRetry={refetch} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('analytics.title')}
        action={
          <div className="flex items-center rounded-btn border border-border/40 overflow-hidden" role="group" aria-label={t('analytics.range')}>
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                aria-pressed={days === r}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === r ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
                }`}
              >
                {t('analytics.lastDays', { count: r })}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label={t('analytics.users')} value={totals.users} color="text-text" align="left" />
        <StatCard label={t('analytics.providers')} value={totals.providers} color="text-text" align="left" />
        <StatCard label={t('analytics.customers')} value={totals.customers} color="text-text" align="left" />
        <StatCard label={t('analytics.liveListings')} value={totals.approved_posts} color="text-text" align="left" />
        <StatCard label={t('analytics.pendingQueue')} value={totals.pending_posts} color="text-warning" align="left" />
        <StatCard label={t('analytics.acceptedBookings')} value={totals.accepted_bookings} color="text-text" align="left" />
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={t('analytics.activePeople')} hint={t('analytics.activePeopleHint')}>
            <LineChart data={series.active_people ?? []} label={t('analytics.activePeople')} unit={t('analytics.people')} />
          </Panel>

          <Panel title={t('analytics.signups')} hint={t('analytics.signupsHint')}>
            <LineChart data={series.signups ?? []} label={t('analytics.signups')} unit={t('analytics.people')} />
          </Panel>

          <Panel title={t('analytics.postVolume')} hint={t('analytics.postVolumeHint')}>
            <ColumnChart data={postVolume} label={t('analytics.postVolume')} unit={t('analytics.posts')} />
          </Panel>

          <Panel title={t('analytics.funnelTitle')} hint={t('analytics.funnelHint')}>
            <Funnel stages={funnelStages} />
          </Panel>

          <Panel title={t('analytics.byCategory')} hint={t('analytics.byCategoryHint')}>
            <BarList data={categories} label={t('analytics.byCategory')} emptyLabel={t('analytics.noData')} />
          </Panel>

          <Panel title={t('analytics.byProvince')} hint={t('analytics.byProvinceHint')}>
            <BarList data={provinces} label={t('analytics.byProvince')} emptyLabel={t('analytics.noData')} />
          </Panel>
        </div>

        <Panel
          title={t('analytics.topPosts')}
          hint={t('analytics.topPostsHint')}
          action={
            <button
              type="button"
              onClick={() => setShowTables((v) => !v)}
              aria-expanded={showTables}
              className="text-xs text-muted hover:text-text transition-colors"
            >
              {showTables ? t('analytics.hideTables') : t('analytics.showTables')}
            </button>
          }
        >
          <DataTable
            columns={[t('posts.title'), t('posts.category'), t('analytics.views')]}
            rows={(data?.top_posts ?? []).map((p) => [
              p.title,
              getCategoryLabel(p.category, t, schemas),
              p.views ?? 0,
            ])}
          />

          {showTables && (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold text-muted mb-2">{t('analytics.activePeople')}</h3>
                <DataTable
                  columns={[t('analytics.day'), t('analytics.people')]}
                  rows={(series.active_people ?? []).map((d) => [d.day, d.value])}
                />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-muted mb-2">{t('analytics.signups')}</h3>
                <DataTable
                  columns={[t('analytics.day'), t('analytics.people')]}
                  rows={(series.signups ?? []).map((d) => [d.day, d.value])}
                />
              </div>
            </div>
          )}
        </Panel>

        {/* Crash log. Without this, `client.error` events pile up in a table
            nobody opens — a bug on a user's phone stays invisible. */}
        <Panel title={t('analytics.clientErrors')} hint={t('analytics.clientErrorsHint')}>
          {(data?.client_errors ?? []).length === 0 ? (
            <p className="text-sm text-muted py-4">{t('analytics.noErrors')}</p>
          ) : (
            <DataTable
              columns={[
                t('analytics.errorMessage'),
                t('analytics.errorPlatform'),
                t('analytics.errorCount'),
                t('analytics.errorPeople'),
                t('analytics.errorLastSeen'),
              ]}
              rows={(data?.client_errors ?? []).map((e) => [
                e.message,
                e.platform,
                e.count,
                e.people,
                e.last_seen,
              ])}
            />
          )}
        </Panel>
      </div>
    </div>
  )
}
