import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { postsApi, categoryApi } from '@/lib/api'
import { getCategoryLabel } from '@/lib/utils'
import PostCard from '@/components/PostCard'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import CategoryPills from '@/components/CategoryPills'
import PostGrid from '@/components/PostGrid'
import Button from '@/components/Button'

export default function CustomerDashboard() {
  const { t } = useTranslation()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['posts', { approval_status: 'APPROVED', limit: 8 }],
    queryFn: () => postsApi.getAll({ approval_status: 'APPROVED', limit: 8 }),
    select: (d) => Array.isArray(d) ? d : (d?.items ?? []),
    staleTime: 30_000,
  })

  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })

  return (
    <div>
      <PageHeader
        title={t('customer.marketTitle')}
        action={
          <Button to="/customer/browse">
            {t('common.viewAll')}
          </Button>
        }
      />
      <CategoryPills
        categories={schemas.filter((s) => s.active).map((s) => ({ key: s.key, label: getCategoryLabel(s.key, t, schemas) }))}
        as="link"
        shape="lg"
        basePath="/customer/browse"
        className="mb-6"
      />
      <h2 className="text-sm font-semibold text-text mb-4">{t('posts.recentPosts')}</h2>
      <PostGrid
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        isEmpty={(data ?? []).length === 0}
        emptyState={<EmptyState title={t('posts.browseEmpty')} description={t('posts.browseEmptyDesc')} />}
        cols={4}
        skeletonCount={8}
      >
        {(data ?? []).map((post, i) => <PostCard key={post.id} post={post} index={i} />)}
      </PostGrid>
    </div>
  )
}
