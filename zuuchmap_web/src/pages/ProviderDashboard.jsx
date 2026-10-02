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
  const { data: profile, isLoading: profileLoading } = useProfile()

  const { data: posts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
  })
  // Counts only once the list is in: `posts` defaults to [] and the tiles read
  // "0 views · 0 posts" (and the chart "no posts") until it landed — or for good
  // if it failed. Undefined renders as "—" in StatCard.
  const loaded = !isLoading && !isError

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
        // The role word is the fallback for a provider with no name, not a
        // placeholder: it flashed "Hello, Provider" on every cold load.
        title={profileLoading
          ? <span className="inline-block h-[1em] w-64 max-w-full skeleton rounded-btn align-middle" />
          : t('provider.greeting', { name: profile?.given_name ?? t('onboarding.provider') })}
        action={
          <Button to="/provider/posts/new">
            <Plus size={15} /> {t('posts.create')}
          </Button>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* Views is the number a provider comes back for — it leads. */}
        <StatCard lead label={t('posts.totalViews')} value={loaded ? totalViews : undefined} color="text-text" className="col-span-2" />
        <StatCard icon={FileText} label={t('profile.totalPosts')} value={loaded ? posts.length : undefined} />
        <StatCard icon={CheckCircle2} label={t('status.approved')} value={loaded ? approved : undefined} color="text-success" />
      </div>
      <div
        className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 mb-8">
        <h2 className="text-sm font-semibold text-text mb-4">{t('posts.postViewsChart')}</h2>
        {isLoading ? (
          <div className="space-y-2.5" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-5 skeleton rounded-btn" />)}
          </div>
        ) : isError ? (
          // The posts grid below carries the retry; "no posts" here would be false.
          <p className="text-base text-muted text-center py-6">—</p>
        ) : chartData.length === 0 ? (
          <p className="text-base text-muted text-center py-6">{t('posts.noMyPosts')}</p>
        ) : (
          <BarList data={chartData} label={t('posts.postViewsChart')} stacked />
        )}
      </div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text">{t('posts.recentPosts')}</h2>
        <Link to="/provider/posts" className="py-2.5 -my-2.5 text-sm text-primary-text hover:underline">{t('common.viewAll')}</Link>
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
