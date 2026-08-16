import { useMinDisplayTime } from '../hooks/useMinDisplayTime'

const COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
}

export default function PostGrid({ isLoading, isEmpty, emptyState, cols = 4, skeletonCount, className = '', children }) {
  const colsClass = COLS[cols] ?? COLS[4]
  const count = skeletonCount ?? cols * 2
  const showSkeleton = useMinDisplayTime(isLoading)

  if (showSkeleton) {
    return (
      <div className={`grid ${colsClass} gap-4 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-64 bg-surface2 rounded-card animate-pulse" />
        ))}
      </div>
    )
  }

  if (isEmpty) return emptyState ?? null

  return <div className={`grid ${colsClass} gap-4 ${className}`}>{children}</div>
}
