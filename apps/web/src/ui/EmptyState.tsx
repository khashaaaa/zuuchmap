import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button, type ButtonStyle } from './Button';
import { Icon } from './Icon';

export interface EmptyStateProps {
  /** Icon disc (64 round, 28 glyph). Ignored when `art` is given. */
  icon?: string;
  /** Art tile (200 × 138, r16): an <img> or any node. One image serves both themes. */
  art?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void; variant?: Extract<ButtonStyle, 'outline' | 'secondary'> };
  className?: string;
}

export function EmptyState({ icon, art, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-8 text-center', className)}>
      {art ? (
        <div className="flex h-[138px] w-[200px] items-center justify-center overflow-hidden rounded-xl bg-bg-surface-sunken">{art}</div>
      ) : (
        icon && (
          <span className="inline-flex size-16 items-center justify-center rounded-pill bg-bg-surface-sunken text-icon-secondary">
            <Icon name={icon} size={28} />
          </span>
        )
      )}
      <h3 className="text-title text-text-primary">{title}</h3>
      {body && <p className="max-w-[320px] text-caption text-text-secondary">{body}</p>}
      {action && (
        <Button size="medium" variant={action.variant ?? 'outline'} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
