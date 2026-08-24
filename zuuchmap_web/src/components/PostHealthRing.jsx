import { useTranslation } from 'react-i18next'

const SIZES = { sm: { px: 36, stroke: 3.5, text: 'text-[10px]' }, md: { px: 64, stroke: 5, text: 'text-base' } }

/**
 * Circular completeness gauge. `health` is the result of computePostHealth;
 * with `showHint` the biggest missing item is named beside the ring.
 */
export default function PostHealthRing({ health, size = 'sm', showHint = false, className = '' }) {
  const { t } = useTranslation()
  const { px, stroke, text } = SIZES[size] ?? SIZES.sm
  const r = (px - stroke) / 2
  const c = 2 * Math.PI * r
  const score = Math.max(0, Math.min(100, health?.score ?? 0))
  const tone = score >= 80 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-danger'
  const label = t('provider.healthScore', { score })

  const ring = (
    <span className={`relative inline-flex items-center justify-center shrink-0 ${tone}`} style={{ width: px, height: px }} role="img" aria-label={label} title={label}>
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="-rotate-90" aria-hidden="true">
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth={stroke} />
        <circle
          cx={px / 2} cy={px / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className={`absolute font-bold tabular-nums text-text ${text}`}>{score}</span>
    </span>
  )
  if (!showHint) return <span className={className}>{ring}</span>

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {ring}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{t('provider.healthTitle')}</p>
        <p className="text-xs text-muted">
          {health?.hint ? t(`provider.healthHint.${health.hint}`) : t('provider.healthComplete')}
        </p>
      </div>
    </div>
  )
}
