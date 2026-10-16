import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LOCALES, isLocale } from '@zuuchmap/core';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { useDocTitle } from '@/lib/meta';
import { useNotificationUnread } from '@/lib/notifications';
import { unregisterPushDevice } from '@/lib/push';
import { useProfile, useProviderHome } from '@/lib/provider';
import { useFormat } from '@/lib/useFormat';
import { useThemeStore, type Theme } from '@/lib/theme';
import { useToast } from '@/lib/toast';
import { AppHeader } from '@/ui/AppHeader';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { CountBadge } from '@/ui/CountBadge';
import { Icon } from '@/ui/Icon';
import { NotificationSettings } from './NotificationSettings';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Select } from '@/ui/Select';

/** R4: a provider's account: the numbers, the shortcuts, the company. */
function ProviderBlock() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useAuthStore((s) => s.user);
  const profile = useProfile();
  const home = useProviderHome();
  const plan = home.data?.plan;
  const company = home.data?.company;
  const planName = plan ? t(plan.name === 'PROVIDER' ? 'prov.listings.planProvider' : 'prov.listings.planFree') : '';
  const name = company?.name ?? profile.data?.given_name ?? me?.phone_number ?? '';
  const avg = home.data?.rating.average;
  const tiles = [
    { label: t('prov.account.totalListings'), value: home.data ? String(home.data.listings.total) : '—' },
    { label: t('prov.account.activeListings'), value: plan ? String(plan.active_posts) : '—' },
    { label: t('prov.account.rating'), value: typeof avg === 'number' ? avg.toFixed(1) : '—' },
  ];
  const rows: { to?: string; icon: string; label: string; hint?: string; count?: number }[] = [
    { to: '/requests', icon: 'inbox', label: t('prov.account.requests'), count: home.data?.pending_requests.count },
    { to: me ? `/sellers/${me.id}/reviews` : undefined, icon: 'star', label: t('prov.account.replyReviews'), count: home.data?.unanswered_reviews },
    { icon: 'credit-card', label: t('prov.account.plan'), hint: plan ? `${t('prov.account.planLine', { plan: planName, used: plan.active_posts, limit: plan.post_limit })}${plan.expires_at ? ` · ${t('prov.account.planUntil', { date: f.date(plan.expires_at) })}` : ''}` : undefined },
    { to: '/provider/company', icon: 'building-2', label: t('prov.account.company'), hint: company?.name ?? t('prov.account.noCompany') },
  ];
  return (
    <>
      <div className="flex items-center gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
        <Avatar name={name} src={company?.logo ?? undefined} type="company" size="large" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-title text-text-primary">
            <span className="truncate">{name}</span>
            {company?.is_verified && <span role="img" aria-label={t('prov.company.verified')} className="inline-flex text-icon-accent"><Icon name="badge-check" size={18} /></span>}
          </p>
          <p className="text-caption text-text-secondary">{profile.data ? t('prov.account.since', { name: me?.phone_number ?? '', date: f.date(profile.data.date_created).slice(0, 7) }) : me?.phone_number}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((x) => (
          <div key={x.label} className="flex flex-col gap-1 rounded-xl border border-border-subtle bg-bg-surface px-3 py-3">
            <p className="text-h2 tabular-nums text-text-primary">{x.value}</p>
            <p className="text-small text-text-secondary">{x.label}</p>
          </div>
        ))}
      </div>
      <nav className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
        {rows.map((r) => {
          const inner = (
            <>
              <Icon name={r.icon} size={20} className="text-icon-secondary" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body text-text-primary">{r.label}</span>
                {r.hint && <span className="truncate text-caption text-text-secondary">{r.hint}</span>}
              </span>
              {typeof r.count === 'number' && r.count > 0 && <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-pill bg-status-danger-fill px-2 text-badge text-text-on-color">{r.count}</span>}
              {r.to && <Icon name="chevron-right" size={20} className="text-icon-secondary" />}
            </>
          );
          const cls = 'flex min-h-14 items-center gap-3 border-b border-border-subtle px-4 py-2 last:border-b-0';
          return r.to ? (
            <Link key={r.label} to={r.to} className={`${cls} focus-visible:outline-none focus-visible:shadow-focus`}>{inner}</Link>
          ) : (
            <div key={r.label} aria-disabled="true" className={`${cls} opacity-70`}>{inner}</div>
          );
        })}
      </nav>
    </>
  );
}

/** Minimal profile: who you are, language, theme, sign out. */
export default function Profile() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const deviceId = useAuthStore((s) => s.deviceId);
  const clear = useAuthStore((s) => s.clear);
  const bell = useNotificationUnread();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  useDocTitle(t('profile.title'));

  const signOut = async () => {
    // This browser stops receiving this account's pushes first, while the token still works.
    await unregisterPushDevice();
    // The web forgets this browser on sign-out (shared computers); the call is best effort.
    try {
      await api('/auth/logout', { method: 'POST', body: { device_id: deviceId } });
    } catch {
      /* the token is dropped either way */
    }
    clear();
    qc.removeQueries({ queryKey: ['likes'] });
    toast.success(t('customer.signin.signedOut'));
  };

  const themes: { value: Theme; label: string }[] = [
    { value: 'light', label: t('kit.theme.light') },
    { value: 'dark', label: t('kit.theme.dark') },
    { value: 'system', label: t('kit.theme.system') },
  ];

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <AppHeader variant="root" title={t('profile.title')} action={user ? { icon: 'bell', label: t('notif.title'), badge: bell, onClick: () => void nav('/notifications') } : undefined} className="md:hidden" />
      <h1 className="hidden px-6 pt-8 text-h1 text-text-primary md:block">{t('profile.title')}</h1>
      <div className="flex flex-col gap-6 px-4 pb-10 pt-3 md:px-6">
        {user?.type === 'PROVIDER' ? (
          <ProviderBlock />
        ) : user ? (
          <div className="flex items-center gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
            <Avatar name={user.phone_number} size="large" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-title text-text-primary">{user.phone_number}</p>
              <p className="text-caption text-text-secondary">{t('profile.phone')}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-5">
            <h2 className="text-h3 text-text-primary">{t('profile.guestTitle')}</h2>
            <p className="text-caption text-text-secondary">{t('profile.guestSubtitle')}</p>
            <Button onClick={() => void nav('/login', { state: { from: '/profile' } })}>{t('auth.title')}</Button>
          </div>
        )}

        {user && (
          <nav className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
            {[{ to: '/notifications', icon: 'bell', label: t('notif.title'), show: true, count: bell }, { to: '/bookings', icon: 'calendar', label: t('deal.mine.title'), show: true, count: 0 }, { to: '/requests', icon: 'inbox', label: t('deal.received.title'), show: false, count: 0 }]
              .filter((r) => r.show)
              .map((r) => (
                <Link key={r.to} to={r.to} className="flex min-h-14 items-center gap-3 border-b border-border-subtle px-4 text-body text-text-primary last:border-b-0 focus-visible:outline-none focus-visible:shadow-focus">
                  <Icon name={r.icon} size={20} className="text-icon-secondary" />
                  <span className="flex-1">{r.label}</span>
                  <CountBadge count={r.count} className="border-0" />
                  <Icon name="chevron-right" size={20} className="text-icon-secondary" />
                </Link>
              ))}
          </nav>
        )}

        {user && <NotificationSettings />}
        <Select
          label={t('customer.profile.language')}
          value={isLocale(i18n.language) ? i18n.language : 'mn'}
          options={LOCALES.map((l) => ({ value: l, label: t(`ui.lang.${l}`) }))}
          onChange={(l) => void i18n.changeLanguage(l)}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-text-primary">{t('customer.profile.theme')}</span>
          <SegmentedControl segments={themes} value={theme} onChange={(v) => setTheme(v)} label={t('customer.profile.theme')} />
        </div>
        {user && <Button variant="outline" icon="log-out" onClick={() => void signOut()}>{t('customer.signin.signOut')}</Button>}
      </div>
    </div>
  );
}
