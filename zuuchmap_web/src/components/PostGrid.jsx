import { useMinDisplayTime } from '../hooks/useMinDisplayTime'
import ErrorState from './ErrorState'

const COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
}

export default function PostGrid({ isLoading, isError, onRetry, isEmpty, emptyState, cols = 4, skeletonCount, className = '', children }) {
  const colsClass = COLS[cols] ?? COLS[4]
  const count = skeletonCount ?? cols * 2
  const showSkeleton = useMinDisplayTime(isLoading)

  if (showSkeleton) {
    return (
      <div className={`grid ${colsClass} gap-4 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-64 skeleton rounded-card" />
        ))}
      </div>
    )
  }

  // A failed fetch must not fall through to the empty state — "nothing here"
  // and "we couldn't ask" are different answers.
  if (isError) return <ErrorState onRetry={onRetry} />

  if (isEmpty) return emptyState ?? null

  return <div className={`grid ${colsClass} gap-4 ${className}`}>{children}</div>
}
