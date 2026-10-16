import type { DateInput } from '@zuuchmap/core';
import { cn } from '@/lib/cn';
import { useFormat } from '@/lib/useFormat';
import { Icon } from './Icon';

export type NotificationType = 'booking' | 'approved' | 'rejected' | 'expiring' | 'savedSearch' | 'review' | 'report' | 'message';

const LOOK: Record<NotificationType, { bg: string; fg: string; icon: string }> = {
  booking: { bg: 'bg-status-info-tint', fg: 'text-status-info', icon: 'calendar-range' },
  approved: { bg: 'bg-status-success-tint', fg: 'text-status-success', icon: 'circle-check' },
  rejected: { bg: 'bg-status-danger-tint', fg: 'text-status-danger', icon: 'circle-alert' },
  expiring: { bg: 'bg-status-warning-tint', fg: 'text-status-warning', icon: 'clock' },
  savedSearch: { bg: 'bg-status-info-tint', fg: 'text-status-info', icon: 'search' },
  review: { bg: 'bg-status-info-tint', fg: 'text-status-info', icon: 'star' },
  report: { bg: 'bg-bg-surface-sunken', fg: 'text-icon-secondary', icon: 'flag' },
  message: { bg: 'bg-status-info-tint', fg: 'text-status-info', icon: 'message-square' },
};

export interface NotificationRowProps {
  type: NotificationType;
  text: string;
  at: DateInput;
  /** Overrides the relative age (the centre shows the date for earlier groups). */
  stamp?: string;
  unread?: boolean;
  onClick?: () => void;
  className?: string;
}

export function NotificationRow({ type, text, at, stamp, unread = false, onClick, className }: NotificationRowProps) {
  const f = useFormat();
  const look = LOOK[type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-start gap-3 bg-bg-surface px-4 py-3.5 text-left focus-visible:outline-none focus-visible:shadow-focus', className)}
    >
      <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-pill', look.bg, look.fg)}>
        <Icon name={look.icon} size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn(unread ? 'text-body-medium text-text-primary' : 'text-body text-text-secondary')}>{text}</span>
        <span className="text-small text-text-tertiary">{stamp ?? f.age(at)}</span>
      </span>
      {unread && <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-pill bg-status-info" />}
    </button>
  );
}
