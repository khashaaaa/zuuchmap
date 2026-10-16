import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Icon } from './Icon';

export type TaskType = 'request' | 'rejected' | 'expiring' | 'chat' | 'review';

const LOOK: Record<TaskType, { bg: string; fg: string; icon: string }> = {
  request: { bg: 'bg-status-info-tint', fg: 'text-status-info', icon: 'calendar-range' },
  rejected: { bg: 'bg-status-danger-tint', fg: 'text-status-danger', icon: 'circle-alert' },
  expiring: { bg: 'bg-status-warning-tint', fg: 'text-status-warning', icon: 'clock' },
  chat: { bg: 'bg-status-info-tint', fg: 'text-status-info', icon: 'message-circle' },
  review: { bg: 'bg-status-warning-tint', fg: 'text-status-warning', icon: 'star' },
};

export interface TaskCardProps {
  type: TaskType;
  title: string;
  subtitle: string;
  /** "Харах" / "Засах" / "Сунгах". */
  actionLabel: string;
  onAction?: () => void;
  className?: string;
}

export function TaskCard({ type, title, subtitle, actionLabel, onAction, className }: TaskCardProps) {
  const look = LOOK[type];
  return (
    <div className={cn('flex items-center gap-3.5 rounded-xl border border-border-elevation bg-bg-surface p-4 shadow-sm', className)}>
      <span className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-pill', look.bg, look.fg)}>
        <Icon name={look.icon} size={22} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body-bold text-text-primary">{title}</p>
        <p className="text-caption text-text-secondary">{subtitle}</p>
      </div>
      <Button variant="outline" size="medium" onClick={onAction} className="shrink-0">{actionLabel}</Button>
    </div>
  );
}
