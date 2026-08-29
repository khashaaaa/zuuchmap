import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { postsApi } from '@/lib/api'
import PostCard from '@/components/PostCard'

/** Horizontal rail of related listings under a post. Renders nothing while empty. */
export default function SimilarPosts({ postId }) {
  const { t } = useTranslation()
  const { data = [] } = useQuery({
    queryKey: ['posts', 'similar', postId],
    queryFn: () => postsApi.similar(postId),
    enabled: Boolean(postId),
    staleTime: 5 * 60_000,
  })
  if (!Array.isArray(data) || data.length === 0) return null

  return (
    <section className="mt-8" aria-labelledby="similar-posts-title">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="similar-posts-title" className="text-base md:text-lg font-semibold text-text">{t('posts.similarTitle')}</h2>
        <span className="text-xs text-muted">{t('posts.similarHint')}</span>
      </div>
      {/* Negative margin lets the first card sit flush with the page edge
          while the rail still bleeds past it on scroll. */}
      <div className="-mx-4 px-4 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth">
        {data.map((p) => (
          <div key={p.id} className="w-64 shrink-0 snap-start">
            <PostCard post={p} />
          </div>
        ))}
      </div>
    </section>
  )
}
