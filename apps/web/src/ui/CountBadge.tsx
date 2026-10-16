import { cn } from '@/lib/cn';

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-pill border-2 border-bg-surface bg-status-danger-fill px-1.5 text-badge text-text-on-color',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
