import { Link } from 'react-router-dom'

export default function CategoryPills({
  categories,
  value,
  onChange,
  allLabel,
  as = 'button',
  shape = 'lg',
  basePath = '/browse',
  activeKey,
  className = '',
}) {
  const shapeClass = shape === 'full' ? 'rounded-full' : 'rounded-btn'
  const baseClass = `inline-flex items-center min-h-[36px] px-3.5 py-2 text-xs font-medium border transition-colors whitespace-nowrap ${shapeClass}`
  // In link mode the current category comes from the URL, not from `value`.
  const selected = as === 'button' ? value : activeKey
  const activeClass = 'bg-primary text-on-primary border-primary'
  const inactiveClass = 'border-border/50 text-muted hover:text-text bg-surface'

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {allLabel !== undefined && (
        as === 'button' ? (
          <button
            type="button"
            onClick={() => onChange?.('')}
            aria-pressed={value === ''}
            className={`${baseClass} ${value === '' ? activeClass : inactiveClass}`}
          >
            {allLabel}
          </button>
        ) : (
          <Link
            to={basePath}
            aria-current={!selected ? 'page' : undefined}
            className={`${baseClass} ${!selected ? activeClass : inactiveClass}`}
          >
            {allLabel}
          </Link>
        )
      )}
      {categories.map((cat) => (
        as === 'button' ? (
          <button
            type="button"
            key={cat.key}
            onClick={() => onChange?.(cat.key)}
            aria-pressed={value === cat.key}
            className={`${baseClass} ${value === cat.key ? activeClass : inactiveClass}`}
          >
            {cat.label}
          </button>
        ) : (
          <Link
            key={cat.key}
            to={`${basePath}?category=${cat.key}`}
            aria-current={selected === cat.key ? 'page' : undefined}
            className={`${baseClass} ${selected === cat.key ? activeClass : inactiveClass}`}
          >
            {cat.label}
          </Link>
        )
      ))}
    </div>
  )
}
