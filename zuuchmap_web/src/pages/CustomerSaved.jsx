import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Heart } from 'lucide-react'
import { likesApi } from '@/lib/api'
import { getPostCategory } from '@/lib/utils'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { toast } from 'sonner'

export default function CustomerSaved() {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: posts = [], isLoading } = useQuery({
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
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 bg-surface2 rounded-card animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Heart} title={t('posts.noSaved')} description={t('posts.noSavedDesc')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {posts.map((post) => {
            const isPendingThis = unlikeMut.isPending && unlikeMut.variables?.postId === post.id
            return (
              <PostCard
                key={post.id}
                post={post}
                actions={
                  <button
                    onClick={() => unlikeMut.mutate({ postType: getPostCategory(post), postId: post.id })}
                    disabled={isPendingThis}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border border-danger/30 text-danger rounded-btn hover:bg-danger/10 disabled:opacity-50 transition-colors"
                  >
                    <Heart size={12} className={isPendingThis ? 'animate-pulse' : ''} fill="currentColor" /> {t('posts.unsave')}
                  </button>
                }
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
