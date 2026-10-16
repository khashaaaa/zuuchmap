import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminListings, useReports } from '@/lib/admin';
import { useAuthStore } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { Icon } from '@/ui/Icon';
import { AdminSidebar, type AdminSidebarKey } from '@/ui/Sidebar';
import { AdminTabBar, type AdminTab } from '@/ui/TabBar';
import { NeedSignIn } from '../NeedSignIn';

const ROUTE: Record<AdminSidebarKey, string> = {
  dashboard: '/admin',
  listings: '/admin/listings',
  users: '/admin/users',
  categories: '/admin/categories',
  analytics: '/admin/analytics',
  reports: '/admin/reports',
  profile: '/admin/profile',
};

const keyOf = (path: string): AdminSidebarKey => {
  const seg = path.split('/')[2] ?? '';
  return (Object.keys(ROUTE) as AdminSidebarKey[]).find((k) => ROUTE[k] === `/admin/${seg}`) ?? 'dashboard';
};

/** Phone: the app's four admin tabs (Figma J1); the queue itself is `/admin/listings`. */
const tabOf = (path: string, all: boolean): AdminTab => {
  const k = keyOf(path);
  if (k === 'reports') return 'reports';
  if (k === 'profile') return 'profile';
  if (k === 'listings' && !all) return 'approval';
  return 'browse';
};

/** Signed-in admins only (the engine checks every call; this only spares a guest the 403s). */
function AdminOnly({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const admin = useAuthStore((s) => !!s.user?.is_admin);
  if (!token) return <NeedSignIn />;
  if (!admin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Desktop: the admin sidebar (Figma J10d). Phone: the admin tab bar. */
export function AdminFrame() {
  const nav = useNavigate();
  const loc = useLocation();
  const all = new URLSearchParams(loc.search).get('tab') === 'all';
  const queue = useAdminListings('PENDING', '', 1, 1);
  const reports = useReports('OPEN');
  const counts = { listings: queue.data?.total ?? 0, reports: reports.data?.total ?? 0 };
  return (
    <AdminOnly>
      <div className="min-h-dvh md:flex">
        <AdminSidebar active={keyOf(loc.pathname)} onSelect={(k) => void nav(ROUTE[k])} counts={counts} />
        <main className="min-w-0 flex-1 bg-bg-canvas">
          <div className="zm-fade-in" key={keyOf(loc.pathname)}>
            <Outlet />
          </div>
          <div aria-hidden="true" className="h-[96px] md:hidden" />
          <AdminTabBar
            className="md:hidden"
            active={tabOf(loc.pathname, all)}
            counts={{ approval: counts.listings, reports: counts.reports }}
            onSelect={(k) => void nav(k === 'browse' ? '/admin/listings?tab=all' : k === 'approval' ? '/admin/listings' : k === 'reports' ? '/admin/reports' : '/admin/profile')}
          />
        </main>
      </div>
    </AdminOnly>
  );
}

/** Title row of an admin page; `back` shows a link above it (Figma J11d "← Хэрэглэгчид"). */
export function AdminHead({ title, subtitle, back, actions, className }: {
  title: string;
  subtitle?: string;
  back?: { label: string; to: string };
  actions?: ReactNode;
  className?: string;
}) {
  const nav = useNavigate();
  return (
    <header className={cn('flex flex-col gap-1 px-4 pb-4 pt-5 md:px-8 md:pt-8', className)}>
      {back && (
        <button type="button" onClick={() => void nav(back.to)} className="mb-1 inline-flex h-8 items-center gap-1 self-start text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
          <Icon name="arrow-left" size={16} />
          {back.label}
        </button>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-h1 text-text-primary">{title}</h1>
          {subtitle && <p className="text-body text-text-secondary">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}

/** The white rounded panel admin pages are built from. */
export function Panel({ children, className, title, hint, action }: { children: ReactNode; className?: string; title?: string; hint?: string; action?: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-card border border-border-subtle bg-bg-surface p-5', className)}>
      {(title || action) && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-h3 text-text-primary">{title}</h2>}
            {hint && <p className="text-small text-text-secondary">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
