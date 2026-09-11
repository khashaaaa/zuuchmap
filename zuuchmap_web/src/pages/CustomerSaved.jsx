import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Heart, Search } from 'lucide-react'
import { likesApi } from '@/lib/api'
import { getPostCategory } from '@/lib/utils'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import PostGrid from '@/components/PostGrid'
import Pagination from '@/components/Pagination'
import Button from '@/components/Button'
import { toast } from 'sonner'

const LIMIT = 20

export default function CustomerSaved() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // The list used to be one unpaged request. The engine's default limit is 20,
  // so a customer with more saves than that was shown twenty of them as the
  // whole shelf — while the same account paged through all of them in the app.
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['liked-posts', page],
    queryFn: () => likesApi.getLiked(page, LIMIT),
    placeholderData: keepPreviousData,
  })
  const posts = data?.posts ?? []
  const total = data?.total ?? 0

  const unlikeMut = useMutation({
    mutationFn: ({ postType, postId }) => likesApi.unlike(postType, postId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liked-posts'] })
      qc.invalidateQueries({ queryKey: ['liked-ids'] })
      qc.invalidateQueries({ queryKey: ['liked-count'] })
      // Without this the listing's own page still read "Saved" from a cached
      // check — the browse grid has invalidated it all along.
      qc.invalidateQueries({ queryKey: ['like-check'] })
      // Unsaving the last card on a page leaves that page empty; step back to
      // one that still has something on it rather than showing an empty shelf
      // with a pager under it.
      if (posts.length === 1 && page > 1) setPage((p) => p - 1)
      toast.success(t('posts.unsaved'))
    },
    onError: () => toast.error(t('common.error')),
  })

  return (
    <div>
      <PageHeader title={t('posts.savedTitle')} description={t('posts.total', { count: total })} />
      <PostGrid
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        isEmpty={posts.length === 0}
        emptyState={
          // Empty for every customer who has not saved anything yet, so it needs
          // a way out — the app's saved list has offered one all along.
          <EmptyState
            icon={Heart}
            title={t('posts.noSaved')}
            description={t('posts.noSavedDesc')}
            action={<Button to="/customer/browse"><Search size={14} /> {t('nav.browse')}</Button>}
          />
        }
        cols={3}
        skeletonCount={6}
      >
        {posts.map((post) => {
          const isPendingThis = unlikeMut.isPending && unlikeMut.variables?.postId === post.id
          return (
            <PostCard
              key={post.id}
              post={post}
              actions={
                <Button
                  variant="danger-outline"
                  size="sm"
                  className="w-full"
                  onClick={() => unlikeMut.mutate({ postType: post.post_type || getPostCategory(post), postId: post.id })}
                  disabled={isPendingThis}
                >
                  <Heart size={12} className={isPendingThis ? 'animate-pulse' : ''} fill="currentColor" /> {t('posts.unsave')}
                </Button>
              }
            />
          )
        })}
      </PostGrid>
      {!isLoading && total > LIMIT && (
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}
          labels={{ previous: t('common.previousPage'), next: t('common.nextPage'), page: t('common.page') }} />
      )}
    </div>
  )
}
