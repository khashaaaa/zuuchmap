import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface SearchBarProps {
  variant?: 'standard' | 'hero';
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /** Hero: the selected place; defaults to "all provinces". */
  location?: string;
  onLocationClick?: () => void;
  focused?: boolean;
  className?: string;
}

const RING = 'focus-within:border-border-focus focus-within:shadow-[inset_0_0_0_1px_var(--color-border-focus)] data-focused:border-border-focus data-focused:shadow-[inset_0_0_0_1px_var(--color-border-focus)]';

export function SearchBar({ variant = 'standard', value, onChange, onSubmit, placeholder, location, onLocationClick, focused, className }: SearchBarProps) {
  const { t } = useTranslation();
  const hero = variant === 'hero';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.(value);
  };
  const input = (
    <input
      type="search"
      inputMode="search"
      enterKeyHint="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? (hero ? t('ui.heroPlaceholder') : t('kit.searchPlaceholder'))}
      aria-label={t('nav.search')}
      className="min-w-0 flex-1 appearance-none bg-transparent text-body text-text-primary outline-none placeholder:text-text-tertiary [&::-webkit-search-cancel-button]:hidden"
    />
  );

  if (!hero) {
    return (
      <form role="search" onSubmit={submit} data-focused={focused ? '' : undefined}
        className={cn('flex h-12 items-center gap-2.5 rounded-input border border-border-default bg-bg-surface px-4', RING, className)}>
        <Icon name="search" size={20} className="text-icon-secondary" />
        {input}
        {value && (
          <button type="button" aria-label={t('common.clear')} onClick={() => onChange('')}
            className="-mr-2 inline-flex size-12 items-center justify-center rounded-pill text-icon-secondary focus-visible:outline-none focus-visible:shadow-focus">
            <Icon name="x" size={18} />
          </button>
        )}
      </form>
    );
  }

  return (
    <form role="search" onSubmit={submit} data-focused={focused ? '' : undefined}
      className={cn('flex h-16 w-full max-w-[720px] items-stretch gap-0 rounded-card border border-border-default bg-bg-surface py-1.5 pl-5 pr-1.5 shadow-md', RING, className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Icon name="search" size={22} className="text-icon-secondary" />
        {input}
      </div>
      <span aria-hidden="true" className="my-auto hidden h-8 w-px bg-border-default sm:block" />
      <button type="button" onClick={onLocationClick}
        className="hidden items-center gap-2 rounded-input px-4 text-body-medium text-text-primary focus-visible:outline-none focus-visible:shadow-focus sm:inline-flex">
        <Icon name="map-pin" size={20} className="text-icon-secondary" />
        {location ?? t('customer.landing.allProvinces')}
        <Icon name="chevron-down" size={18} className="text-icon-secondary" />
      </button>
      <button type="submit"
        className="rounded-button bg-action-primary px-6 text-body-bold text-action-on-primary transition-colors duration-(--duration-fast) enabled:active:bg-action-primary-pressed focus-visible:outline-none focus-visible:shadow-focus">
        {t('nav.search')}
      </button>
    </form>
  );
}
