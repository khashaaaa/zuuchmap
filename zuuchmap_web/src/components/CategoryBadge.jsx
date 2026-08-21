import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getCategoryLabel, getCategoryColor, toneForTheme, withAlpha } from '../lib/utils'
import { categoryApi } from '../lib/api'
import { useThemeStore } from '../store'

export default function CategoryBadge({ category }) {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })

  const label = getCategoryLabel(category, t, schemas)

  // Every badge used to be `bg-primary/10 text-primary`, which painted all eight
  // verticals amber — the accent ended up on every card in a list and stopped
  // meaning anything. A badge now wears its own category colour, re-lit for the
  // active theme so the label clears 4.5:1.
  const base = getCategoryColor(category, schemas)
  if (!base) {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded-md bg-primary/10 text-primary-text border border-primary/20 font-medium">
        {label}
      </span>
    )
  }

  const isDark = theme !== 'light'
  const fg = toneForTheme(base, isDark)

  return (
    <span
      className="inline-block px-2 py-0.5 text-xs rounded-md border font-medium"
      style={{
        backgroundColor: withAlpha(base, isDark ? 0.18 : 0.12),
        borderColor: withAlpha(base, isDark ? 0.35 : 0.25),
        color: fg,
      }}
    >
      {label}
    </span>
  )
}
