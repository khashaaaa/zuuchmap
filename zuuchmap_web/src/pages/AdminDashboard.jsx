import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { FileText, Users, CheckCircle, XCircle, Clock, UserCheck, UserSearch } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { getCategoryLabel } from '@/lib/utils'
import StatCard from '@/components/StatCard'
import PageHeader from '@/components/PageHeader'

const PIE_COLORS = ['var(--color-primary)', 'var(--color-muted)']

export default function AdminDashboard() {
  const { t } = useTranslation()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
    staleTime: 30_000,
  })

  const categoryChartData = stats?.byType
    ? stats.byType.map((row) => ({
        name: getCategoryLabel(row.postType, t),
        total: Number(row.total),
        pending: Number(row.pending),
      }))
    : []

  const userPieData = stats
    ? [
        { name: t('admin.totalProviders'), value: stats.totalProviders ?? 0 },
        { name: t('admin.totalCustomers'), value: stats.totalCustomers ?? 0 },
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
    { icon: UserCheck, label: t('admin.totalProviders'), value: stats?.totalProviders, color: 'text-primary' },
    { icon: UserSearch, label: t('admin.totalCustomers'), value: stats?.totalCustomers, color: 'text-muted' },
  ]

  return (
    <div>
      <PageHeader title={t('admin.dashboard')} description={t('admin.subtitle')} />

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface2 rounded-card animate-pulse" />
          ))}
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {categoryChartData.length > 0 && (
          <div className="lg:col-span-2 bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6">
            <h2 className="text-sm font-semibold text-text mb-4">{t('admin.postsByCategory')}</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryChartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}
                />
                <Bar dataKey="total" name={t('admin.totalPosts')} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name={t('admin.pendingPosts')} fill="var(--color-muted)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {userPieData.some((d) => d.value > 0) && (
          <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6">
            <h2 className="text-sm font-semibold text-text mb-4">{t('admin.userBreakdown')}</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={userPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {userPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
