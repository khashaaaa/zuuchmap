import { cn } from '@/lib/cn';

export interface RadioProps {
  label: string;
  name: string;
  value: string;
  checked: boolean;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function Radio({ label, name, value, checked, onChange, disabled, className }: RadioProps) {
  return (
    <label className={cn('inline-flex min-h-12 select-none items-center gap-3', disabled ? 'cursor-not-allowed' : 'cursor-pointer', className)}>
      <input
        type="radio"
        className="peer sr-only"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange?.(value)}
      />
      <span
        className={cn(
          'size-[22px] shrink-0 rounded-pill bg-bg-surface transition-[border-width] duration-(--duration-fast)',
          'peer-focus-visible:shadow-focus',
          checked ? 'border-[6px] border-action-secondary' : 'border-[1.5px] border-border-strong',
          disabled && 'opacity-50',
        )}
      />
      <span className={cn('text-body', disabled ? 'text-text-disabled' : 'text-text-primary')}>{label}</span>
    </label>
  );
}
