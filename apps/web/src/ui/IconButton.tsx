import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type IconButtonStyle = 'surface' | 'ghost' | 'primary' | 'media';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: string;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  variant?: IconButtonStyle;
  size?: 'large' | 'medium';
  pressed?: boolean;
}

const STYLES: Record<IconButtonStyle, string> = {
  surface: 'bg-bg-surface-sunken text-icon-primary enabled:active:opacity-80 data-pressed:opacity-80',
  ghost: 'bg-transparent text-icon-primary enabled:active:bg-bg-surface-sunken data-pressed:bg-bg-surface-sunken',
  primary:
    'bg-action-primary text-action-on-primary enabled:active:bg-action-primary-pressed data-pressed:bg-action-primary-pressed',
  media: 'bg-bg-media-scrim text-text-on-media enabled:active:opacity-80 data-pressed:opacity-80',
};

/** Icons that mean "saved" when the button is aria-pressed: signal orange, filled, and one pop as they turn on. */
const SAVE_ICONS = new Set(['heart', 'bookmark']);

export function IconButton({ icon, label, variant = 'surface', size = 'large', pressed, className, type = 'button', ...rest }: IconButtonProps) {
  const saved = SAVE_ICONS.has(icon) && (rest['aria-pressed'] === true || rest['aria-pressed'] === 'true');
  const [pop, setPop] = useState(false);
  const was = useRef(saved);
  useEffect(() => {
    if (saved && !was.current) setPop(true);
    was.current = saved;
  }, [saved]);
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      data-pressed={pressed ? '' : undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-pill transition-colors duration-(--duration-fast)',
        'focus-visible:outline-none focus-visible:shadow-focus',
        // 40 px buttons get a 4 px hit-slop so the target is 48.
        size === 'large' ? 'size-12' : 'size-10 before:absolute before:-inset-1 before:content-[""]',
        STYLES[variant],
        // `!`: cn does not merge, so the variant's own text colour would otherwise win by CSS order.
        saved && 'text-action-primary! [&_svg]:fill-current',
        pop && 'zm-save-pop',
        'disabled:cursor-not-allowed disabled:bg-bg-surface-sunken disabled:text-text-disabled',
        className,
      )}
      {...rest}
      onAnimationEnd={(e) => {
        setPop(false);
        rest.onAnimationEnd?.(e);
      }}
    >
      <Icon name={icon} size={size === 'large' ? 24 : 20} />
    </button>
  );
}
