import { Rows3, Rows4 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function DensityToggle({ density, onToggle, className = '' }) {
  const { t } = useTranslation()
  const isCompact = density === 'compact'

  return (
    <button
      type="button"
      onClick={onToggle}
      title={t(isCompact ? 'admin.densityComfortable' : 'admin.densityCompact')}
      aria-label={t(isCompact ? 'admin.densityComfortable' : 'admin.densityCompact')}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border/50 rounded-btn text-muted hover:text-primary-text hover:border-primary/40 transition-colors ${className}`}
    >
      {isCompact ? <Rows4 size={14} /> : <Rows3 size={14} />}
      {t(isCompact ? 'admin.densityComfortable' : 'admin.densityCompact')}
    </button>
  )
}
