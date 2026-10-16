import type { ButtonHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type ButtonStyle = 'primary' | 'secondary' | 'outline' | 'danger';
export type ButtonSize = 'large' | 'medium';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonStyle;
  size?: ButtonSize;
  icon?: string;
  loading?: boolean;
  /** Renders the pressed look statically (kit / tests). */
  pressed?: boolean;
}

const STYLES: Record<ButtonStyle, string> = {
  primary:
    'bg-action-primary text-action-on-primary enabled:active:bg-action-primary-pressed data-pressed:bg-action-primary-pressed',
  secondary:
    'bg-action-secondary text-action-on-secondary enabled:active:bg-action-secondary/86 data-pressed:bg-action-secondary/86',
  outline:
    'border-[1.5px] border-border-default bg-transparent text-text-primary enabled:active:bg-bg-surface-sunken data-pressed:bg-bg-surface-sunken',
  danger:
    'bg-status-danger-fill text-text-on-color enabled:active:bg-status-danger-fill data-pressed:bg-status-danger-fill',
};

export function Button({
  variant = 'primary', size = 'large', icon, loading = false, pressed, className, children, disabled, onClick, type = 'button', ...rest
}: ButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      data-pressed={pressed ? '' : undefined}
      onClick={loading ? undefined : onClick}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-button transition-colors duration-(--duration-fast)',
        'focus-visible:outline-none focus-visible:shadow-focus',
        size === 'large' ? 'h-12 px-5 text-body-bold' : 'h-10 px-4 text-label-strong',
        STYLES[variant],
        'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-bg-surface-sunken disabled:text-text-disabled',
        loading && 'cursor-progress',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Icon name="loader-2" size={size === 'large' ? 20 : 18} className="animate-spin" />
          <span className="sr-only">{t('ui.loading')}</span>
        </>
      ) : (
        icon && <Icon name={icon} size={size === 'large' ? 20 : 18} />
      )}
      <span>{children}</span>
    </button>
  );
}
