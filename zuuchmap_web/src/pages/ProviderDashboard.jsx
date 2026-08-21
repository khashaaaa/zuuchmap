import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, FileText, Eye } from 'lucide-react'
import { postsApi } from '@/lib/api'
import { BarList } from '@/components/Charts'
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

  const { data: posts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
  })

  const totalViews = useMemo(() => posts.reduce((sum, p) => sum + (p.views ?? 0), 0), [posts])
  const approved = useMemo(() => posts.filter((p) => p.approval_status === 'APPROVED').length, [posts])
  // BarList truncates via CSS and shows the full title on hover — no manual clipping.
  const chartData = useMemo(() => posts.map((p) => ({
    key: p.id,
    label: p.title || '—',
    value: p.views ?? 0,
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
        <h2 className="text-sm font-semibold text-text mb-4">{t('posts.postViewsChart')}</h2>
        {chartData.length === 0 ? (
          <p className="text-base text-muted text-center py-6">{t('posts.noMyPosts')}</p>
        ) : (
          <BarList data={chartData} label={t('posts.postViewsChart')} />
        )}
      </div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text">{t('posts.recentPosts')}</h2>
        <Link to="/provider/posts" className="text-sm text-primary-text hover:underline">{t('common.viewAll')}</Link>
      </div>
      <PostGrid
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
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
        {posts.slice(0, 6).map((post, i) => (
          <PostCard key={post.id} post={post} to={`/provider/posts/${post.id}`} index={i} />
        ))}
      </PostGrid>
    </div>
  )
}
