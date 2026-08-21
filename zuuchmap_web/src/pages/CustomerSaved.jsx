import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Heart } from 'lucide-react'
import { likesApi } from '@/lib/api'
import { getPostCategory } from '@/lib/utils'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import PostGrid from '@/components/PostGrid'
import Button from '@/components/Button'
import { toast } from 'sonner'

export default function CustomerSaved() {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: posts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['liked-posts'],
    queryFn: likesApi.getLiked,
  })

  const unlikeMut = useMutation({
    mutationFn: ({ postType, postId }) => likesApi.unlike(postType, postId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liked-posts'] })
      qc.invalidateQueries({ queryKey: ['liked-ids'] })
      toast.success(t('posts.unsaved'))
    },
    onError: () => toast.error(t('common.error')),
  })

  return (
    <div>
      <PageHeader title={t('posts.savedTitle')} description={t('posts.total', { count: posts.length })} />
      <PostGrid
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        isEmpty={posts.length === 0}
        emptyState={<EmptyState icon={Heart} title={t('posts.noSaved')} description={t('posts.noSavedDesc')} />}
        cols={3}
        skeletonCount={6}
      >
        {posts.map((post, i) => {
          const isPendingThis = unlikeMut.isPending && unlikeMut.variables?.postId === post.id
          return (
            <PostCard
              key={post.id}
              post={post}
              index={i}
              actions={
                <Button
                  variant="danger-outline"
                  size="sm"
                  className="w-full"
                  onClick={() => unlikeMut.mutate({ postType: getPostCategory(post), postId: post.id })}
                  disabled={isPendingThis}
                >
                  <Heart size={12} className={isPendingThis ? 'animate-pulse' : ''} fill="currentColor" /> {t('posts.unsave')}
                </Button>
              }
            />
          )
        })}
      </PostGrid>
    </div>
  )
}
