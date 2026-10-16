import { cn } from '@/lib/cn';
import type { ToastAction, ToastTone } from '@/lib/toast';
import { Icon } from './Icon';

export interface ToastProps {
  tone?: ToastTone;
  message: string;
  action?: ToastAction;
  className?: string;
}

const ICON: Record<ToastTone, { name: string; cls: string }> = {
  success: { name: 'circle-check', cls: 'text-status-success' },
  error: { name: 'circle-alert', cls: 'text-status-danger' },
  info: { name: 'info', cls: 'text-status-info' },
};

/**
 * Always the dark palette so it stands off either theme. The shadow sits on the outer
 * wrapper (the page's theme: a shadow in light, none in dark), the colours on the
 * inner `data-theme="dark"` box.
 */
export function Toast({ tone = 'info', message, action, className }: ToastProps) {
  const icon = ICON[tone];
  return (
    <div className={cn('rounded-lg shadow-lg', className)}>
      <div
        data-theme="dark"
        role={tone === 'error' ? 'alert' : 'status'}
        className="flex min-h-[54px] items-center gap-3 rounded-lg border border-border-default bg-bg-surface-raised py-3 pl-4 pr-3.5"
      >
        <Icon name={icon.name} size={20} className={icon.cls} />
        <p className="min-w-0 flex-1 text-body-medium text-text-primary">{message}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="-my-3 -mr-1.5 inline-flex h-12 shrink-0 items-center rounded-lg px-2 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
