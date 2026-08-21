import { useTranslation } from 'react-i18next'

const STATUS_CLS = {
  ACTIVE:    'bg-success/10 text-success border-success/20',
  RENTED:    'bg-muted/10 text-muted border-border/50',
  EXPIRED:   'bg-danger/10 text-danger border-danger/20',
  PENDING:   'bg-warning/10 text-warning border-warning/20',
  APPROVED:  'bg-success/10 text-success border-success/20',
  REJECTED:  'bg-danger/10 text-danger border-danger/20',
  ACCEPTED:  'bg-success/10 text-success border-success/20',
  DECLINED:  'bg-danger/10 text-danger border-danger/20',
  CANCELLED: 'bg-muted/10 text-muted border-border/50',
}

export default function StatusBadge({ status }) {
  const { t } = useTranslation()
  const cls = STATUS_CLS[status] ?? 'bg-surface2 text-muted border-border/50'
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
