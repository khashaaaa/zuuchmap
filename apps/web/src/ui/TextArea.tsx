import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helper?: string;
}

/** TextField's multi-line sibling (booking message, review comment, replies). */
export function TextArea({ label, helper, className, id, rows = 3, ...rest }: TextAreaProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-label text-text-primary">{label}</label>
      <textarea
        id={inputId}
        rows={rows}
        className="min-h-[88px] resize-none rounded-input border border-border-default bg-bg-surface px-4 py-3 text-body text-text-primary caret-border-focus outline-none placeholder:text-text-tertiary focus:border-border-focus focus:shadow-[inset_0_0_0_1px_var(--color-border-focus)]"
        {...rest}
      />
      {helper && <p className="text-small text-text-secondary">{helper}</p>}
    </div>
  );
}
