import { useTranslation } from 'react-i18next'

// Label uses the `-text` step, not the fill hue: the /10 tint moves the ground
// enough that the fill colour on its own tint falls under AA at 12px.
// Post lifecycle (`status`) and moderation (`approval_status`) share one
// vocabulary; bookings keep their own, because EXPIRED means different things
// to each. A single map made the two EXPIREDs collide silently.
const POST_CLS = {
  ACTIVE:    'bg-success/10 text-success-text border-success/20',
  RENTED:    'bg-muted/10 text-muted border-border/50',
  EXPIRED:   'bg-danger/10 text-danger-text border-danger/20',
  PENDING:   'bg-warning/10 text-warning-text border-warning/20',
  APPROVED:  'bg-success/10 text-success-text border-success/20',
  REJECTED:  'bg-danger/10 text-danger-text border-danger/20',
}

const BOOKING_CLS = {
  PENDING:   'bg-warning/10 text-warning-text border-warning/20',
  ACCEPTED:  'bg-success/10 text-success-text border-success/20',
  DECLINED:  'bg-danger/10 text-danger-text border-danger/20',
  CANCELLED: 'bg-muted/10 text-muted border-border/50',
  // Nobody acted and the dates ran out — reads as quiet as CANCELLED, because
  // it is nobody's refusal. A post that lapsed is the owner's problem to fix,
  // so that one stays loud.
  EXPIRED:   'bg-muted/10 text-muted border-border/50',
}

export default function StatusBadge({ status, kind = 'post' }) {
  const { t } = useTranslation()
  const cls = (kind === 'booking' ? BOOKING_CLS : POST_CLS)[status] ?? 'bg-surface2 text-muted border-border/50'
  const label = status ? t(`status.${status.toLowerCase()}`, { defaultValue: status }) : '—'
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-md border font-medium ${cls}`}>
      {label}
    </span>
  )
}

// Neutral pill for secondary metadata (e.g. a subcategory) — same shape as the
// status pills, no semantic colour.
export function Chip({ className = '', children }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-md bg-surface2 text-muted border border-border/50 font-medium ${className}`}>
      {children}
    </span>
  )
}

export function TypeBadge({ type }) {
  const { t } = useTranslation()
  const cls = type === 'PROVIDER' ? 'bg-primary/10 text-primary-text border-primary/20' : 'bg-surface2 text-muted border-border/50'
  const label = type === 'PROVIDER' ? t('onboarding.provider') : type === 'CUSTOMER' ? t('onboarding.customer') : '—'
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded-md border font-medium ${cls}`}>
      {label}
    </span>
  )
}
