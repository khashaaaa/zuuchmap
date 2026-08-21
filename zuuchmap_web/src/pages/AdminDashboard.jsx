import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileText, Users, CheckCircle, XCircle, Clock, UserCheck, UserSearch } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { getCategoryLabel } from '@/lib/utils'
import StatCard from '@/components/StatCard'
import PageHeader from '@/components/PageHeader'
import ErrorState from '@/components/ErrorState'
import { BarList } from '@/components/Charts'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'

export default function AdminDashboard() {
  const { t } = useTranslation()

  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
    staleTime: 30_000,
  })
  const showSkeleton = useMinDisplayTime(isLoading)

  const categoryChartData = stats?.byType
    ? stats.byType.map((row) => ({
        key: row.postType,
        label: getCategoryLabel(row.postType, t),
        value: Number(row.total),
        secondary: Number(row.pending),
      }))
    : []

  const userBreakdownData = stats
    ? [
        { key: 'providers', label: t('admin.totalProviders'), value: stats.totalProviders ?? 0 },
        { key: 'customers', label: t('admin.totalCustomers'), value: stats.totalCustomers ?? 0 },
      ]
    : []

  const postStatCards = [
    { icon: FileText, label: t('admin.totalPosts'), value: stats?.totals?.total, color: 'text-text' },
    { icon: Clock, label: t('admin.pendingPosts'), value: stats?.totals?.pending, color: 'text-warning' },
    { icon: CheckCircle, label: t('admin.approvedPosts'), value: stats?.totals?.approved, color: 'text-success' },
    { icon: XCircle, label: t('admin.rejectedPosts'), value: stats?.totals?.rejected, color: 'text-danger' },
  ]
  const userStatCards = [
    { icon: Users, label: t('admin.totalUsers'), value: stats?.totalUsers, color: 'text-text' },
    { icon: UserCheck, label: t('admin.totalProviders'), value: stats?.totalProviders, color: 'text-primary-text' },
    { icon: UserSearch, label: t('admin.totalCustomers'), value: stats?.totalCustomers, color: 'text-muted' },
  ]

  return (
    <div>
      <PageHeader title={t('admin.dashboard')} description={t('admin.subtitle')} />

      {showSkeleton ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface2 rounded-card animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <h2 className="text-sm font-semibold text-muted mb-2">{t('admin.postsSection')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
            {postStatCards.map(({ icon, label, value, color }) => (
              <StatCard key={label} icon={icon} label={label} value={value ?? 0} color={color} />
            ))}
          </div>

          <h2 className="text-sm font-semibold text-muted mb-2 mt-6">{t('admin.usersSection')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
            {userStatCards.map(({ icon, label, value, color }) => (
              <StatCard key={label} icon={icon} label={label} value={value ?? 0} color={color} />
            ))}
          </div>
        </>
      )}

      {/* An empty chart panel and a missing one look the same — say "no data"
          instead of silently dropping the section (ProviderDashboard idiom). */}
      {!showSkeleton && !isError && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6">
          <h2 className="text-sm font-semibold text-text mb-4">{t('admin.postsByCategory')}</h2>
          {categoryChartData.length === 0 ? (
            <p className="text-base text-muted text-center py-6">{t('analytics.noData')}</p>
          ) : (
            <>
              {/* BarList direct-labels values; the pending overlay still needs naming. */}
              <div className="flex items-center gap-4 mb-3 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-chart" aria-hidden="true" />
                  {t('admin.totalPosts')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted" aria-hidden="true" />
                  {t('admin.pendingPosts')}
                </span>
              </div>
              <BarList data={categoryChartData} label={t('admin.postsByCategory')} />
            </>
          )}
        </div>

        <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6">
          <h2 className="text-sm font-semibold text-text mb-4">{t('admin.userBreakdown')}</h2>
          {!userBreakdownData.some((d) => d.value > 0) ? (
            <p className="text-base text-muted text-center py-6">{t('analytics.noData')}</p>
          ) : (
            <BarList data={userBreakdownData} label={t('admin.userBreakdown')} />
          )}
        </div>
      </div>
      )}
    </div>
  )
}
