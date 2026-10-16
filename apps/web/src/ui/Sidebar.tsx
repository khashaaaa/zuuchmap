import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';
import { LogoMark } from './Logo';
import { QuotaMeter } from './TabBar';

export interface SidebarItemProps {
  icon: string;
  label: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
}

/** No chevrons. */
export function SidebarItem({ icon, label, active = false, count = 0, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-md px-3 text-left focus-visible:outline-none focus-visible:shadow-focus',
        active ? 'bg-bg-surface-sunken text-label-strong text-text-primary' : 'text-label text-text-secondary hover:bg-bg-surface-sunken',
      )}
    >
      <Icon name={icon} size={20} className={active ? 'text-icon-primary' : 'text-icon-secondary'} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && <CountBadge count={count} />}
    </button>
  );
}

interface ShellProps {
  children: ReactNode;
  width: string;
  label: string;
  preview?: boolean;
  className?: string;
}

/** Desktop only. `preview` renders in flow at every width (kit, tests). */
function SidebarShell({ children, width, label, preview, className }: ShellProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'flex-col gap-1 border-r border-border-subtle bg-bg-surface px-4 py-5',
        width,
        preview ? 'flex' : 'sticky top-0 hidden h-dvh overflow-y-auto md:flex',
        className,
      )}
    >
      {children}
    </nav>
  );
}

export type ProviderSidebarKey = 'home' | 'listings' | 'bookings' | 'messages' | 'profile';

export interface ProviderSidebarProps {
  active: ProviderSidebarKey;
  onSelect?: (key: ProviderSidebarKey) => void;
  onAdd?: () => void;
  quota?: { used: number; total: number };
  /** Overrides the default "Үнэгүй багц · …" line. */
  quotaLabel?: string;
  unread?: number;
  preview?: boolean;
  className?: string;
}

export function ProviderSidebar({ active, onSelect, onAdd, quota, quotaLabel, unread = 0, preview, className }: ProviderSidebarProps) {
  const { t } = useTranslation();
  const items: { key: ProviderSidebarKey; icon: string; label: string; count?: number }[] = [
    { key: 'home', icon: 'home', label: t('nav.home') },
    { key: 'listings', icon: 'list', label: t('nav.myListings') },
    { key: 'bookings', icon: 'calendar', label: t('nav.bookings') },
    { key: 'messages', icon: 'message-circle', label: t('messages.title'), count: unread },
    { key: 'profile', icon: 'user', label: t('nav.profile') },
  ];
  return (
    <SidebarShell width="w-[264px] shrink-0" label={t('nav.home')} preview={preview} className={className}>
      <div className="flex items-center gap-2 pb-4 pl-2">
        <LogoMark size={28} className="text-brand-mark" />
        <span className="text-h3 text-text-primary">ZuuchMap</span>
      </div>
      <Button variant="secondary" icon="plus" onClick={onAdd} className="w-full">{t('nav.addListing')}</Button>
      {quota && (
        <div className="flex items-center gap-2 px-1 pb-4 pt-2">
          <QuotaMeter used={quota.used} total={quota.total} className="w-[72px] shrink-0" />
          <span className="text-small text-text-secondary">{quotaLabel ?? t('ui.quota', quota)}</span>
        </div>
      )}
      {items.map((i) => (
        <SidebarItem key={i.key} icon={i.icon} label={i.label} count={i.count} active={active === i.key} onClick={() => onSelect?.(i.key)} />
      ))}
    </SidebarShell>
  );
}

export type AdminSidebarKey = 'dashboard' | 'approval' | 'reports' | 'users' | 'categories' | 'analytics' | 'profile';

export interface AdminSidebarProps {
  active: AdminSidebarKey;
  onSelect?: (key: AdminSidebarKey) => void;
  preview?: boolean;
  className?: string;
}

export function AdminSidebar({ active, onSelect, preview, className }: AdminSidebarProps) {
  const { t } = useTranslation();
  const items: { key: AdminSidebarKey; icon: string; label: string }[] = [
    { key: 'dashboard', icon: 'layout-grid', label: t('admin.dashboard') },
    { key: 'approval', icon: 'shield-check', label: t('admin.pendingPosts') },
    { key: 'reports', icon: 'flag', label: t('report.queue') },
    { key: 'users', icon: 'users', label: t('admin.users') },
    { key: 'categories', icon: 'file-text', label: t('nav.categories') },
    { key: 'analytics', icon: 'bar-chart-3', label: t('analytics.title') },
    { key: 'profile', icon: 'user', label: t('nav.profile') },
  ];
  return (
    <SidebarShell width="w-[260px] shrink-0" label={t('admin.role')} preview={preview} className={cn('gap-1.5 pb-0', className)}>
      <div className="flex items-center gap-2 pb-4 pl-2">
        <LogoMark size={28} className="text-action-primary" />
        <span className="text-h3 text-text-primary">ZuuchMap</span>
        <span className="rounded-sm bg-bg-surface-sunken px-1.5 py-0.5 text-overline text-text-secondary">{t('admin.role')}</span>
      </div>
      {items.map((i) => (
        <SidebarItem key={i.key} icon={i.icon} label={i.label} active={active === i.key} onClick={() => onSelect?.(i.key)} />
      ))}
    </SidebarShell>
  );
}
