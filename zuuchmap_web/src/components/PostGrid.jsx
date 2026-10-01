import { useMinDisplayTime } from '../hooks/useMinDisplayTime'
import ErrorState from './ErrorState'

// Container queries, not viewport breakpoints: the grid sits beside a 240px
// sidebar and, on browse, a 256px filter column, so the viewport says nothing
// about the room it actually has — at 1024px `md:grid-cols-3` produced 141px
// cards. Columns are added per 28rem of the grid's own width (~220px cards).
const COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 @md:grid-cols-2',
  3: 'grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3',
  4: 'grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4',
}

export default function PostGrid({ isLoading, isStale = false, isError, onRetry, isEmpty, emptyState, cols = 4, skeletonCount, className = '', children }) {
  const colsClass = COLS[cols] ?? COLS[4]
  const count = skeletonCount ?? cols * 2
  const showSkeleton = useMinDisplayTime(isLoading)

  if (showSkeleton) {
    return (
      <div className="@container">
        <div className={`grid ${colsClass} gap-4 ${className}`}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="h-64 skeleton rounded-card" />
          ))}
        </div>
      </div>
    )
  }

  // A failed fetch must not fall through to the empty state — "nothing here"
  // and "we couldn't ask" are different answers.
  if (isError) return <ErrorState onRetry={onRetry} />

  if (isEmpty) return emptyState ?? null

  // `isStale`: the previous results held on screen while a new query is in
  // flight. Dimmed, so they do not read as the answer to the new filter.
  return (
    <div className="@container" aria-busy={isStale || undefined}>
      <div className={`grid ${colsClass} gap-4 transition-opacity duration-200 ${isStale ? 'opacity-50' : ''} ${className}`}>{children}</div>
    </div>
  )

}
