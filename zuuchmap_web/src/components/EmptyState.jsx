import { Inbox } from 'lucide-react'
import { useThemeStore } from '@/store'
import { withAlpha, toneForTheme } from '@/lib/utils'

/**
 * `tint` (a category hex) keeps an empty state inside the section's identity —
 * a filtered category with nothing in it stays that category's colour instead
 * of collapsing to the generic grey medallion.
 */
export default function EmptyState({ icon: Icon = Inbox, title, description, action, tint }) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme !== 'light'
  const discStyle = tint ? { backgroundColor: withAlpha(tint, isDark ? 0.15 : 0.1) } : undefined
  const iconStyle = tint ? { color: toneForTheme(tint, isDark) } : undefined
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-surface2 flex items-center justify-center mb-4" style={discStyle}>
        <Icon size={24} className={tint ? undefined : 'text-muted'} style={iconStyle} />
      </div>
      <p className="text-text font-medium">{title}</p>
      {description && <p className="text-sm text-muted mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
