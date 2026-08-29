import { useThemeStore } from '@/store'
import { withAlpha, toneForTheme } from '@/lib/utils'

export const pillShape = (shape) => (shape === 'full' ? 'rounded-full' : 'rounded-btn')
// Category labels are admin-editable: `whitespace-nowrap` alone lets one long
// pill overrun the wrapping row and force horizontal page scroll.
export const pillBase = 'inline-flex items-center min-h-[36px] px-3.5 py-2 text-xs font-medium border transition-colors whitespace-nowrap max-w-full truncate'
export const pillAmber = 'bg-primary text-on-primary border-primary'
export const pillInactive = 'border-border/50 text-muted hover:text-text bg-surface'

/**
 * Category *filter* pills — buttons with a selected state. An active category
 * wears its *own* colour (the tinted-fill idiom CategoryBadge uses) so the
 * verticals stay distinguishable at the exact moment the user is choosing
 * between them; solid amber is reserved for the "All" pill, so amber stays the
 * rarest accent. Callers may pass `color` per category (getCategoryColor);
 * without it the active state falls back to amber.
 */
export default function CategoryFilterPills({ categories, value, onChange, allLabel, shape = 'lg', className = '' }) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme !== 'light'
  const baseClass = `${pillBase} ${pillShape(shape)}`

  const activePropsFor = (cat) => {
    if (!cat?.color) return { className: `${baseClass} ${pillAmber}` }
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
        <button
          type="button"
          onClick={() => onChange?.('')}
          aria-pressed={value === ''}
          className={`${baseClass} ${value === '' ? pillAmber : pillInactive}`}
        >
          {allLabel}
        </button>
      )}
      {categories.map((cat) => {
        const isActive = value === cat.key
        const props = isActive ? activePropsFor(cat) : { className: `${baseClass} ${pillInactive}` }
        return (
          <button type="button" key={cat.key} onClick={() => onChange?.(cat.key)} aria-pressed={isActive} {...props}>
            {cat.label}
          </button>
        )
      })}
    </div>
  )
}
