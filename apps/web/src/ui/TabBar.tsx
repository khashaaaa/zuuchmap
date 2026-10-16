import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';

export interface TabBarItemProps {
  icon: string;
  label: string;
  active?: boolean;
  /** Count over the icon (unread messages). */
  count?: number;
  onClick?: () => void;
}

/** Same type size active and default, so nothing shifts. */
export function TabBarItem({ icon, label, active = false, count = 0, onClick }: TabBarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg focus-visible:outline-none focus-visible:shadow-focus"
    >
      {active && <span aria-hidden="true" data-tab-marker="" className="absolute left-1/2 top-0 h-[3px] w-6 -translate-x-1/2 rounded-xs bg-action-primary" />}
      <span className="relative inline-flex">
        <Icon name={icon} size={24} className={active ? 'text-icon-primary' : 'text-icon-secondary'} />
        {count > 0 && <CountBadge count={count} className="absolute -right-3 -top-2" />}
      </span>
      <span className={cn('max-w-full truncate', active ? 'text-overline text-text-primary' : 'text-micro text-text-secondary')}>{label}</span>
    </button>
  );
}

export interface TabBarProps {
  children: ReactNode;
  /** `preview`: in flow and visible at every width (kit, tests). Otherwise fixed to the bottom, phones only. */
  preview?: boolean;
  /** The pad/gutter differs per preset (Admin uses 19). */
  className?: string;
  label?: string;
}

/** The items' own markers are hidden; one marker slides to the active item (no slide on first paint). */
function TabBar({ children, preview = false, className, label }: TabBarProps) {
  const { t } = useTranslation();
  const nav = useRef<HTMLElement>(null);
  const [x, setX] = useState<{ left: number; animate: boolean } | null>(null);
  useLayoutEffect(() => {
    const item = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const left = item ? item.offsetLeft + item.offsetWidth / 2 - 12 : null;
    setX((prev) => (left === null ? null : prev?.left === left ? prev : { left, animate: prev !== null }));
  }, [children]);
  return (
    <nav
      ref={nav}
      aria-label={label ?? t('nav.home')}
      className={cn(
        'z-30 flex w-full items-end [&_[data-tab-marker]]:hidden border-t border-border-subtle bg-bg-surface px-2 pb-[max(20px,env(safe-area-inset-bottom))] pt-1.5',
        preview ? 'relative' : 'fixed inset-x-0 bottom-0 md:hidden',
        className,
      )}
    >
      {x && (
        <span
          aria-hidden="true"
          className={cn('absolute left-0 top-1.5 h-[3px] w-6 rounded-xs bg-action-primary', x.animate && 'transition-transform duration-(--duration-normal) ease-[cubic-bezier(0.22,1,0.36,1)]')}
          style={{ transform: `translateX(${x.left}px)` }}
        />
      )}
      {children}
    </nav>
  );
}

interface PresetProps<K extends string> {
  active: K;
  onSelect?: (key: K) => void;
  preview?: boolean;
  className?: string;
}

export type CustomerTab = 'search' | 'saved' | 'messages' | 'profile';

export function CustomerTabBar({ active, onSelect, unread = 0, preview, className }: PresetProps<CustomerTab> & { unread?: number }) {
  const { t } = useTranslation();
  const items: { key: CustomerTab; icon: string; label: string; count?: number }[] = [
    { key: 'search', icon: 'search', label: t('nav.search') },
    { key: 'saved', icon: 'bookmark', label: t('nav.saved') },
    { key: 'messages', icon: 'message-circle', label: t('messages.title'), count: unread },
    { key: 'profile', icon: 'user', label: t('nav.profile') },
  ];
  return (
    <TabBar preview={preview} className={className}>
      {items.map((i) => (
        <TabBarItem key={i.key} icon={i.icon} label={i.label} count={i.count} active={active === i.key} onClick={() => onSelect?.(i.key)} />
      ))}
    </TabBar>
  );
}

export type ProviderTab = 'home' | 'listings' | 'messages' | 'profile';

export interface QuotaMeterProps {
  used: number;
  total: number;
  className?: string;
}

/** 2 px-gap bars: used = text/primary, free = border/default. */
export function QuotaMeter({ used, total, className }: QuotaMeterProps) {
  return (
    <span aria-hidden="true" className={cn('flex h-[3px] gap-0.5', className)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('h-full flex-1 rounded-xs', i < used ? 'bg-text-primary' : 'bg-border-default')} />
      ))}
    </span>
  );
}

export function ProviderTabBar({
  active, onSelect, onAdd, quota, unread = 0, preview, className,
}: PresetProps<ProviderTab> & { onAdd?: () => void; quota?: { used: number; total: number }; unread?: number }) {
  const { t } = useTranslation();
  const item = (key: ProviderTab, icon: string, label: string, count?: number) => (
    <TabBarItem key={key} icon={icon} label={label} count={count} active={active === key} onClick={() => onSelect?.(key)} />
  );
  return (
    <TabBar preview={preview} className={className}>
      {item('home', 'home', t('nav.home'))}
      {item('listings', 'list', t('nav.myListings'))}
      <button
        type="button"
        onClick={onAdd}
        className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg focus-visible:outline-none focus-visible:shadow-focus"
      >
        <span className="-mt-1 inline-flex size-12 items-center justify-center rounded-pill bg-action-primary text-action-on-primary shadow-md">
          <Icon name="plus" size={24} />
        </span>
        {quota && <QuotaMeter used={quota.used} total={quota.total} className="w-[34px]" />}
        <span className="max-w-full truncate text-micro text-text-secondary">{t('nav.addListing')}</span>
      </button>
      {item('messages', 'message-circle', t('messages.title'), unread)}
      {item('profile', 'user', t('nav.profile'))}
    </TabBar>
  );
}

export type AdminTab = 'browse' | 'approval' | 'reports' | 'profile';

export function AdminTabBar({ active, onSelect, preview, className, counts }: PresetProps<AdminTab> & { counts?: Partial<Record<AdminTab, number>> }) {
  const { t } = useTranslation();
  const items: { key: AdminTab; icon: string; label: string; count?: number }[] = [
    { key: 'browse', icon: 'search', label: t('admin.tab.search') },
    { key: 'approval', icon: 'shield-check', label: t('admin.tab.queue'), count: counts?.approval },
    { key: 'reports', icon: 'flag', label: t('admin.tab.reports'), count: counts?.reports },
    { key: 'profile', icon: 'user', label: t('admin.tab.profile') },
  ];
  return (
    <TabBar preview={preview} className={cn('px-[19px]', className)}>
      {items.map((i) => (
        <TabBarItem key={i.key} icon={i.icon} label={i.label} count={i.count} active={active === i.key} onClick={() => onSelect?.(i.key)} />
      ))}
    </TabBar>
  );
}
