import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { postsApi, categoryApi } from '@/lib/api'
import { getCategoryLabel } from '@/lib/utils'
import PostCard from '@/components/PostCard'
import PageHeader from '@/components/PageHeader'
import CategoryPills from '@/components/CategoryPills'
import PostGrid from '@/components/PostGrid'
import Button from '@/components/Button'

export default function CustomerDashboard() {
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
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
        className="mb-6"
      />
      <h2 className="font-semibold text-text mb-4">{t('posts.recentPosts')}</h2>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[280px] bg-surface2 rounded-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(data ?? []).map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      )}
    </div>
  )
}
