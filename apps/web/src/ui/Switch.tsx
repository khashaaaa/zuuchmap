import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; the switch has no visible label of its own. */
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('group inline-flex h-12 w-[52px] shrink-0 items-center focus-visible:outline-none', disabled && 'cursor-not-allowed opacity-50', className)}
    >
      <span
        className={cn(
          'flex h-8 w-[52px] items-center rounded-pill p-[3px] transition-colors duration-(--duration-fast) group-focus-visible:shadow-focus',
          checked ? 'bg-action-secondary' : 'bg-control-track',
        )}
      >
        <span
          className={cn(
            'size-[26px] rounded-pill transition-transform duration-(--duration-fast)',
            checked ? 'translate-x-5 bg-action-on-secondary' : 'translate-x-0 bg-control-thumb',
          )}
        />
      </span>
    </button>
  );
}
