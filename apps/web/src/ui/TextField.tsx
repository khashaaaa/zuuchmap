import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  helper?: string;
  error?: string;
  icon?: string;
  /** Renders the focused look statically (kit / tests). */
  focused?: boolean;
}

export function TextField({ label, helper, error, icon, focused, className, disabled, id, ...rest }: TextFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const noteId = `${inputId}-note`;
  const note = error ?? helper;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className={cn('text-label', disabled ? 'text-text-disabled' : 'text-text-primary')}>
        {label}
      </label>
      <div
        data-focused={focused ? '' : undefined}
        className={cn(
          'flex h-12 items-center gap-2.5 rounded-input border px-4 transition-colors duration-(--duration-fast)',
          disabled ? 'border-border-default bg-bg-surface-sunken' : 'bg-bg-surface',
          error
            ? 'border-status-danger shadow-[inset_0_0_0_1px_var(--color-status-danger)]'
            : 'border-border-default focus-within:border-border-focus focus-within:shadow-[inset_0_0_0_1px_var(--color-border-focus)] data-focused:border-border-focus data-focused:shadow-[inset_0_0_0_1px_var(--color-border-focus)]',
        )}
      >
        {icon && <Icon name={icon} size={20} className={disabled ? 'text-text-disabled' : 'text-icon-secondary'} />}
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className="min-w-0 flex-1 bg-transparent text-body text-text-primary caret-border-focus outline-none placeholder:text-text-tertiary disabled:text-text-disabled disabled:placeholder:text-text-disabled"
          {...rest}
        />
      </div>
      {note && (
        <p id={noteId} className={cn('flex items-center gap-1.5 text-small', error ? 'text-status-danger' : disabled ? 'text-text-disabled' : 'text-text-secondary')}>
          {error && <Icon name="circle-alert" size={16} />}
          {note}
        </p>
      )}
    </div>
  );
}
