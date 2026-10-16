import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface Segment<V extends string> {
  value: V;
  label: string;
  icon?: string;
}

export interface SegmentedControlProps<V extends string> {
  segments: readonly Segment<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  className?: string;
}

/** The selected surface is one pill that slides between the equal segments (4 px padding and gaps). */
export function SegmentedControl<V extends string>({ segments, value, onChange, label, className }: SegmentedControlProps<V>) {
  const n = segments.length;
  const index = Math.max(0, segments.findIndex((s) => s.value === value));
  return (
    <div role="group" aria-label={label} className={cn('relative flex h-11 gap-1 rounded-pill bg-bg-surface-sunken p-1', className)}>
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-pill bg-bg-surface shadow-sm transition-transform duration-(--duration-normal) ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `calc((100% - ${8 + 4 * (n - 1)}px) / ${n})`, transform: `translateX(calc(${index} * (100% + 4px)))` }}
      />
      {segments.map((s) => {
        const on = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(s.value)}
            className={cn(
              'relative inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-pill px-4 text-label-strong transition-colors duration-(--duration-fast)',
              'focus-visible:outline-none focus-visible:shadow-focus',
              on ? 'text-text-primary' : 'text-text-secondary',
            )}
          >
            {s.icon && <Icon name={s.icon} size={18} />}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
