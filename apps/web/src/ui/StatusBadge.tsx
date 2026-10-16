import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export const STATUSES = [
  'pending', 'rejected', 'expired', 'available', 'busy', 'verified', 'draft', 'accepted', 'live', 'cancelled', 'completed',
] as const;
export type Status = (typeof STATUSES)[number];

const WARN = 'bg-status-warning-tint text-status-warning';
const DANGER = 'bg-status-danger-tint text-status-danger';
const OK = 'bg-status-success-tint text-status-success';
const INFO = 'bg-status-info-tint text-status-info';
const MUTED = 'bg-bg-surface-sunken text-text-secondary';

const LOOK: Record<Status, { cls: string; icon: string }> = {
  pending: { cls: WARN, icon: 'clock' },
  rejected: { cls: DANGER, icon: 'circle-alert' },
  expired: { cls: MUTED, icon: 'clock' },
  available: { cls: OK, icon: 'check' },
  busy: { cls: INFO, icon: 'calendar' },
  verified: { cls: INFO, icon: 'badge-check' },
  draft: { cls: MUTED, icon: 'pencil' },
  accepted: { cls: OK, icon: 'circle-check' },
  live: { cls: OK, icon: 'circle-check' },
  cancelled: { cls: MUTED, icon: 'clock' },
  completed: { cls: MUTED, icon: 'check' },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { t } = useTranslation();
  const { cls, icon } = LOOK[status];
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-tag px-2 text-overline', cls, className)}>
      <Icon name={icon} size={14} />
      {t(`kit.status.${status}`)}
    </span>
  );
}
