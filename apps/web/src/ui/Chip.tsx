import type { ButtonHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type ChipType = 'filter' | 'category' | 'removable';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  label: string;
  type?: ChipType;
  selected?: boolean;
  /** Category chips: the icon name (falls back to the family icon). */
  icon?: string;
  /** Category chips: key for the category text colour. */
  categoryKey?: string;
  /** Removable chips: called when the chip is pressed. */
  onRemove?: () => void;
}

export function Chip({ label, type = 'filter', selected = false, icon, categoryKey, onRemove, className, onClick, ...rest }: ChipProps) {
  const { t } = useTranslation();
  const removable = type === 'removable';
  return (
    <button
      type="button"
      aria-pressed={removable ? undefined : selected}
      aria-label={removable ? `${t('ui.remove')}: ${label}` : undefined}
      onClick={removable ? (onRemove ?? onClick) : onClick}
      className={cn(
        // 36 px chip + 6 px hit-slop above and below = 48.
        'relative inline-flex h-9 select-none items-center gap-1.5 rounded-pill px-3 text-label-strong transition-colors duration-(--duration-fast)',
        'before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[""]',
        'focus-visible:outline-none focus-visible:shadow-focus',
        removable
          ? 'bg-bg-surface-sunken text-text-primary'
          : selected
            ? 'bg-action-secondary text-action-on-secondary'
            : 'border border-border-default bg-bg-surface text-text-primary',
        className,
      )}
      {...rest}
    >
      {type === 'category' && icon !== undefined && (
        <span style={!selected && categoryKey ? { color: `var(--color-category-text-${categoryKey})` } : undefined} className="inline-flex">
          <Icon name={icon} size={18} categoryKey={categoryKey} />
        </span>
      )}
      <span>{label}</span>
      {removable && <Icon name="x" size={16} />}
    </button>
  );
}
