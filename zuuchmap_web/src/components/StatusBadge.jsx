import { useTranslation } from 'react-i18next'

const STATUS_CLS = {
  ACTIVE:   'bg-success/10 text-success border-success/20',
  RENTED:   'bg-muted/10 text-muted border-border/50',
  EXPIRED:  'bg-danger/10 text-danger border-danger/20',
  PENDING:  'bg-warning/10 text-warning border-warning/20',
  APPROVED: 'bg-success/10 text-success border-success/20',
  REJECTED: 'bg-danger/10 text-danger border-danger/20',
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
