import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type BannerTone = 'info' | 'warning' | 'offline' | 'danger';

export interface BannerProps {
  tone: BannerTone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const LOOK: Record<BannerTone, { bg: string; icon: string; iconCls: string }> = {
  info: { bg: 'bg-status-info-tint', icon: 'info', iconCls: 'text-status-info' },
  warning: { bg: 'bg-status-warning-tint', icon: 'alert-triangle', iconCls: 'text-status-warning' },
  offline: { bg: 'bg-bg-surface-sunken', icon: 'wifi-off', iconCls: 'text-icon-secondary' },
  danger: { bg: 'bg-status-danger-tint', icon: 'circle-alert', iconCls: 'text-status-danger' },
};

export function Banner({ tone, title, body, action, className }: BannerProps) {
  const look = LOOK[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-lg px-4 py-3', look.bg, className)}>
      <Icon name={look.icon} size={20} className={cn('mt-px', look.iconCls)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-label-strong text-text-primary">{title}</p>
        {body && <p className="text-caption text-text-secondary">{body}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="-my-2 -mr-2 inline-flex h-12 shrink-0 items-center rounded-lg px-2 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export type NoticeKind = 'offline' | 'rejected' | 'quota' | 'pushOff';

export interface Notice {
  kind: NoticeKind;
  /** Overrides the default copy. */
  title?: string;
  body?: string;
  /** Quota only: `{{used}}` of `{{total}}`. */
  used?: number;
  total?: number;
  onAction?: () => void;
  actionLabel?: string;
}

const PRIORITY: NoticeKind[] = ['offline', 'rejected', 'quota', 'pushOff'];
const TONE: Record<NoticeKind, BannerTone> = { offline: 'offline', rejected: 'danger', quota: 'warning', pushOff: 'info' };

/** One notice slot per screen: only the highest-priority notice shows (offline > rejected > quota > notifications off). */
export function NoticeSlot({ notices, className }: { notices: readonly Notice[]; className?: string }) {
  const { t } = useTranslation();
  const top = [...notices].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
  if (!top) return null;
  const k = `kit.notice.${top.kind}`;
  const action = top.kind === 'offline' ? undefined : top.onAction && { label: top.actionLabel ?? t(`${k}.action`), onClick: top.onAction };
  const defaultBody = top.kind === 'offline' ? t(`${k}.body`) : top.kind === 'quota' ? t(`${k}.body`, { used: top.used ?? 0, total: top.total ?? 0 }) : undefined;
  return <Banner tone={TONE[top.kind]} title={top.title ?? t(`${k}.title`)} body={top.body ?? defaultBody} action={action} className={className} />;
}
