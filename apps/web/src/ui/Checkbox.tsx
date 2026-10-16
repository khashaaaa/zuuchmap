import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

interface CheckboxBase {
  /** `'indeterminate'` shows the minus. */
  checked: boolean | 'indeterminate';
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** A visible `label` or, without one, an `aria-label`. */
export type CheckboxProps = CheckboxBase & ({ label: string; 'aria-label'?: string } | { label?: undefined; 'aria-label': string });

export function Checkbox({ label, 'aria-label': ariaLabel, checked, onChange, disabled, className }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const on = checked !== false;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = checked === 'indeterminate';
  }, [checked]);
  return (
    <label className={cn('inline-flex min-h-12 select-none items-center gap-3', disabled ? 'cursor-not-allowed' : 'cursor-pointer', className)}>
      <input
        ref={ref}
        type="checkbox"
        className="peer sr-only"
        checked={checked === true}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span
        className={cn(
          'inline-flex size-[22px] shrink-0 items-center justify-center rounded-tag transition-colors duration-(--duration-fast)',
          'peer-focus-visible:shadow-focus',
          on ? 'bg-action-secondary text-action-on-secondary' : 'border-[1.5px] border-border-strong bg-bg-surface',
          disabled && 'opacity-50',
        )}
      >
        {on && <Icon name={checked === 'indeterminate' ? 'minus' : 'check'} size={16} strokeWidth={3} />}
      </span>
      {label && <span className={cn('text-body', disabled ? 'text-text-disabled' : 'text-text-primary')}>{label}</span>}
    </label>
  );
}
