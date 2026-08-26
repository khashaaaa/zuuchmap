import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import PostCard from './PostCard'

/**
 * The posts behind a tapped map pin, as a snap rail over the map. Ports the
 * app's `MapClusterCarousel` — a cluster badge says how many are here, and this
 * is how you read them without leaving the map.
 *
 * Cards are the same `PostCard` the rest of the site uses (as in `SimilarPosts`)
 * rather than a map-only card, so a listing looks the same wherever it is met.
 */
export default function MapClusterCarousel({ posts, onClose }) {
  const { t } = useTranslation()
  const railRef = useRef(null)
  const [active, setActive] = useState(0)

  // The counter tracks whichever card is nearest the rail's left edge.
  const onScroll = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const card = rail.firstElementChild
    if (!card) return
    const interval = card.offsetWidth + 16 // w-64 + gap-4
    setActive(Math.max(0, Math.min(posts.length - 1, Math.round(rail.scrollLeft / interval))))
  }, [posts.length])

  if (!posts?.length) return null

  return (
    <div className="absolute inset-x-0 bottom-0 z-[500] pointer-events-none p-3">
      <div className="flex items-center justify-between mb-2 pointer-events-auto">
        <span className="text-xs font-medium text-text bg-surface/90 backdrop-blur px-2.5 py-1 rounded-full shadow-card">
          {posts.length > 1
            ? t('map.carouselCounter', { index: active + 1, count: posts.length })
            : t('map.postsAtLocation', { count: 1 })}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-8 h-8 grid place-items-center rounded-full bg-surface/90 backdrop-blur shadow-card text-muted hover:text-text transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={railRef}
        onScroll={onScroll}
        className="flex gap-4 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth pointer-events-auto"
      >
        {posts.map((p, i) => (
          <div key={p.id} className="w-64 shrink-0 snap-start">
            <PostCard post={p} index={Math.min(i, 3)} />
          </div>
        ))}
      </div>
    </div>
  )
}
