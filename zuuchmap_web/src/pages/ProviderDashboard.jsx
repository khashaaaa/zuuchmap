import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, FileText, CheckCircle2 } from 'lucide-react'
import { postsApi } from '@/lib/api'
import { BarList } from '@/components/Charts'
import { useProfile } from '@/hooks/useProfile'
import StatCard from '@/components/StatCard'
import PageHeader from '@/components/PageHeader'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import PostGrid from '@/components/PostGrid'
import Button from '@/components/Button'

/** Rows in the views chart; the rest are reachable from the posts list. */
const CHART_ROWS = 8

export default function ProviderDashboard() {
  const { t } = useTranslation()
  const { data: profile } = useProfile()

  const { data: posts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
  })

  const totalViews = useMemo(() => posts.reduce((sum, p) => sum + (p.views ?? 0), 0), [posts])
  const approved = useMemo(() => posts.filter((p) => p.approval_status === 'APPROVED').length, [posts])
  // BarList truncates via CSS and shows the full title on hover — no manual clipping.
  // Only the busiest handful: an unsorted bar per post is a wall of empty rows
  // once a provider has more than a page of listings.
  const chartData = useMemo(() => posts
    .map((p) => ({ key: p.id, label: p.title || '—', value: p.views ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, CHART_ROWS), [posts])

  return (
    <div>
      <PageHeader
        title={t('provider.greeting', { name: profile?.given_name ?? t('onboarding.provider') })}
        action={
          <Button to="/provider/posts/new">
            <Plus size={15} /> {t('posts.create')}
          </Button>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* Views is the number a provider comes back for — it leads. */}
        <StatCard lead label={t('posts.totalViews')} value={totalViews} color="text-text" className="col-span-2" />
        <StatCard icon={FileText} label={t('profile.totalPosts')} value={posts.length} />
        <StatCard icon={CheckCircle2} label={t('status.approved')} value={approved} color="text-success" />
      </div>
      <div
        className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 mb-8">
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
        skeletonCount={6}
      >
        {posts.slice(0, 6).map((post) => (
          <PostCard key={post.id} post={post} to={`/provider/posts/${post.id}`} />
        ))}
      </PostGrid>
    </div>
  )
}
