import { Link } from 'react-router-dom'
import { useThemeStore } from '@/store'
import { withAlpha, toneForTheme } from '@/lib/utils'

/**
 * Category selector pills. An active category wears its *own* colour — the
 * tinted-fill idiom CategoryBadge uses — so the thirteen verticals stay
 * distinguishable at the exact moment the user is choosing between them.
 * Solid amber is reserved for the "All" pill: amber stays the rarest accent.
 * Callers may pass `color` per category (getCategoryColor); without it the
 * active state falls back to amber.
 */
export default function CategoryPills({
  categories,
  value,
  onChange,
  allLabel,
  as = 'button',
  shape = 'lg',
  basePath = '/browse',
  className = '',
}) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme !== 'light'

  const shapeClass = shape === 'full' ? 'rounded-full' : 'rounded-btn'
  // Category labels are admin-editable: `whitespace-nowrap` alone lets one long
  // pill overrun the wrapping row and force horizontal page scroll.
  const baseClass = `inline-flex items-center min-h-[36px] px-3.5 py-2 text-xs font-medium border transition-colors whitespace-nowrap max-w-full truncate ${shapeClass}`
  const amberActive = 'bg-primary text-on-primary border-primary'
  const inactiveClass = 'border-border/50 text-muted hover:text-text bg-surface'

  const activePropsFor = (cat) => {
    if (!cat?.color) return { className: `${baseClass} ${amberActive}` }
    return {
      className: `${baseClass} font-semibold`,
      style: {
        backgroundColor: withAlpha(cat.color, isDark ? 0.18 : 0.12),
        borderColor: withAlpha(cat.color, 0.35),
        color: toneForTheme(cat.color, isDark),
      },
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {allLabel !== undefined && (
        as === 'button' ? (
          <button
            type="button"
            onClick={() => onChange?.('')}
            aria-pressed={value === ''}
            className={`${baseClass} ${value === '' ? amberActive : inactiveClass}`}
          >
            {allLabel}
          </button>
        ) : (
          <Link to={basePath} className={`${baseClass} ${inactiveClass}`}>
            {allLabel}
          </Link>
        )
      )}
      {categories.map((cat) => {
        const isActive = as === 'button' && value === cat.key
        const activeProps = isActive ? activePropsFor(cat) : { className: `${baseClass} ${inactiveClass}` }
        return as === 'button' ? (
          <button
            type="button"
            key={cat.key}
            onClick={() => onChange?.(cat.key)}
            aria-pressed={isActive}
            {...activeProps}
          >
            {cat.label}
          </button>
        ) : (
          <Link
            key={cat.key}
            to={`${basePath}?category=${cat.key}`}
            {...activeProps}
          >
            {cat.label}
          </Link>
        )
      })}
    </div>
  )
}
