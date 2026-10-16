import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOverview } from '@/lib/admin';
import { useAuthStore } from '@/lib/auth';
import { useDocTitle } from '@/lib/meta';
import { useSignOut } from '@/lib/push';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { AdminHead } from './Frame';

/** Figma J8d: who is signed in, the management shortcuts, help and sign-out. */
export default function AdminProfile() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const signOut = useSignOut();
  const phone = useAuthStore((s) => s.user?.phone_number ?? '');
  const o = useOverview().data;
  useDocTitle(t('nav.profile'));
  const row = (to: string, icon: string, label: string, hint?: string) => (
    <Link key={to} to={to} className="flex min-h-14 items-center gap-3 border-b border-border-subtle px-4 py-2 last:border-b-0 focus-visible:outline-none focus-visible:shadow-focus">
      <Icon name={icon} size={20} className="text-icon-secondary" />
      <span className="min-w-0 flex-1">
        <span className="block text-body text-text-primary">{label}</span>
        {hint && <span className="block text-small text-text-secondary">{hint}</span>}
      </span>
      <Icon name="chevron-right" size={20} className="text-icon-secondary" />
    </Link>
  );
  return (
    <div className="pb-10">
      <AdminHead title={t('nav.profile')} />
      <div className="flex max-w-[640px] flex-col gap-5 px-4 md:px-8">
        <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-bg-surface p-4">
          <Avatar name={phone} size="large" />
          <div>
            <p className="text-title text-text-primary">{t('admin.role')}</p>
            <p className="text-caption text-text-secondary">{t('admin.me.rights', { phone: `${phone.slice(0, 4)} ${phone.slice(4)}` })}</p>
          </div>
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="text-overline text-text-secondary">{t('admin.me.manage')}</h2>
          <nav className="flex flex-col overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
            {row('/admin/users', 'users', t('admin.users'), o ? t('admin.me.usersLine', { users: o.users.total, providers: o.users.providers }) : undefined)}
            {row('/admin/analytics', 'bar-chart-3', t('analytics.title'), t('admin.me.analyticsLine'))}
          </nav>
        </section>
        <nav className="flex flex-col overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
          {row('/help', 'help-circle', t('legal.helpRow'))}
          {row('/privacy', 'shield-check', t('legal.privacy.title'))}
          {row('/terms', 'file-text', t('legal.terms.title'))}
        </nav>
        <Button
          variant="outline"
          icon="log-out"
          onClick={() => void signOut().then(() => nav('/', { replace: true }))}
        >
          {t('customer.signin.signOut')}
        </Button>
      </div>
    </div>
  );
}
