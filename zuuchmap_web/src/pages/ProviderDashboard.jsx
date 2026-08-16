import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, FileText, Eye } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { postsApi } from '@/lib/api'
import { useAuthStore as useStore } from '@/store'
import StatCard from '@/components/StatCard'
import PageHeader from '@/components/PageHeader'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import PostGrid from '@/components/PostGrid'
import Button from '@/components/Button'

export default function ProviderDashboard() {
  const { t } = useTranslation()
  const user = useStore((s) => s.user)

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
  })

  const totalViews = useMemo(() => posts.reduce((sum, p) => sum + (p.views ?? 0), 0), [posts])
  const approved = useMemo(() => posts.filter((p) => p.approval_status === 'APPROVED').length, [posts])
  const chartData = useMemo(() => posts.map((p) => ({
    name: p.title ? p.title.substring(0, 15) + (p.title.length > 15 ? '…' : '') : '—',
    views: p.views ?? 0,
  })), [posts])

  return (
    <div>
      <PageHeader
        title={t('provider.greeting', { name: user?.given_name ?? t('onboarding.provider') })}
        action={
          <Button to="/provider/posts/new">
            <Plus size={15} /> {t('posts.create')}
          </Button>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard icon={FileText} label={t('profile.totalPosts')} value={posts.length} />
        <StatCard icon={FileText} label={t('status.approved')} value={approved} color="text-success" />
        <StatCard icon={Eye} label={t('posts.totalViews')} value={totalViews} />
      </div>
      <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 mb-8">
        <h3 className="text-sm font-semibold text-text mb-4">{t('posts.postViewsChart')}</h3>
        {chartData.length === 0 ? (
          <p className="text-base text-muted text-center py-6">{t('posts.noMyPosts')}</p>
        ) : (
          <div className="min-h-[160px]">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text)' }}
                cursor={{ fill: 'var(--color-surface2)' }}
              />
              <Bar dataKey="views" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-text">{t('posts.recentPosts')}</h2>
        <Link to="/provider/posts" className="text-sm text-primary hover:underline">{t('common.viewAll')}</Link>
      </div>
      <PostGrid
        isLoading={isLoading}
        isEmpty={posts.length === 0}
        emptyState={
          <EmptyState
            icon={FileText}
            title={t('posts.noMyPosts')}
            action={
              <Button to="/provider/posts/new">
                {t('posts.create')}
              </Button>
            }
          />
        }
        cols={3}
        skeletonCount={3}
      >
        {posts.slice(0, 6).map((post) => (
          <PostCard key={post.id} post={post} to={`/provider/posts/${post.id}`} />
        ))}
      </PostGrid>
    </div>
  )
}
