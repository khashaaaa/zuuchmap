import { Link } from 'react-router-dom'

export default function CategoryPills({
  categories,
  value,
  onChange,
  allLabel,
  as = 'button',
  shape = 'lg',
  className = '',
}) {
  const shapeClass = shape === 'full' ? 'rounded-full' : 'rounded-btn'
  const baseClass = `px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap ${shapeClass}`
  const activeClass = 'bg-primary text-on-primary border-primary'
  const inactiveClass = 'border-border/50 text-muted hover:text-text bg-surface'

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {allLabel !== undefined && (
        as === 'button' ? (
          <button
            type="button"
            onClick={() => onChange?.('')}
            className={`${baseClass} ${value === '' ? activeClass : inactiveClass}`}
          >
            {allLabel}
          </button>
        ) : (
          <Link
            to="/customer/browse"
            className={`${baseClass} ${inactiveClass}`}
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
            className={`${baseClass} ${value === cat.key ? activeClass : inactiveClass}`}
          >
            {cat.label}
          </button>
        ) : (
          <Link
            key={cat.key}
            to={`/customer/browse?category=${cat.key}`}
            className={`${baseClass} ${inactiveClass}`}
          >
            {cat.label}
          </Link>
        )
      ))}
    </div>
  )
}
