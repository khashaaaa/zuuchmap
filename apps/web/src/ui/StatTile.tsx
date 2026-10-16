import { groupThousands } from '@zuuchmap/core';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface StatTileProps {
  icon: string;
  label: string;
  value: number | string;
  delta?: { kind: 'up' | 'flat'; text: string };
  className?: string;
}

export function StatTile({ icon, label, value, delta, className }: StatTileProps) {
  return (
    <div className={cn('flex min-h-[106px] flex-col gap-1.5 rounded-xl border border-border-subtle bg-bg-surface px-4 py-3.5', className)}>
      <p className="flex items-center gap-1.5 text-small text-text-secondary">
        <Icon name={icon} size={16} />
        {label}
      </p>
      <p className="text-h2 tabular-nums text-text-primary">{typeof value === 'number' ? groupThousands(value) : value}</p>
      {delta && <p className={cn('text-small', delta.kind === 'up' ? 'text-status-success' : 'text-text-tertiary')}>{delta.text}</p>}
    </div>
  );
}
