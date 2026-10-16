import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useSignInSheet, type SignInReason } from '@/lib/auth';
import { useBadges, useNotificationUnread, useUnread } from '@/lib/notifications';
import { usePushRegistration } from '@/lib/push';
import { useRealtime } from '@/lib/realtime';
import { BottomSheet } from '@/ui/BottomSheet';
import { DesktopHeader, type DesktopHeaderKey } from '@/ui/DesktopHeader';
import { ProviderSidebar, type ProviderSidebarKey } from '@/ui/Sidebar';
import { CustomerTabBar, ProviderTabBar, type CustomerTab, type ProviderTab } from '@/ui/TabBar';
import { Toaster } from '@/ui/Toaster';
import { NotificationPanel } from './NotificationPanel';
import { PushSheet } from './sheets/PushSheet';
import { SignInFlow } from './SignIn';

const REASON: Record<SignInReason, string> = {
  message: 'customer.signin.sheetMessage',
  book: 'customer.signin.sheetBook',
  search: 'customer.signin.sheetSearch',
  generic: 'auth.loginRequired',
};

function SignInSheet() {
  const { t } = useTranslation();
  const { open, reason, resume, hide } = useSignInSheet();
  return (
    <BottomSheet open={open} onClose={hide} title={t('customer.signin.sheetTitle')}>
      <p className="text-body text-text-secondary">{t(REASON[reason])}</p>
      <SignInFlow
        onDone={() => {
          hide();
          resume?.();
        }}
      />
      <p className="text-small text-text-secondary">{t('customer.signin.sheetNote')}</p>
    </BottomSheet>
  );
}

function tabFor(path: string): CustomerTab {
  if (path.startsWith('/saved')) return 'saved';
  if (path.startsWith('/messages')) return 'messages';
  if (path.startsWith('/profile') || path.startsWith('/login') || path.startsWith('/become')) return 'profile';
  return 'search';
}

const HIDE_TABS = /^\/(posts|login|become-provider|sos|messages\/|bookings|requests|sellers|notifications)/;

/** The provider's own pages: the sidebar (md and up) or provider tab bar (phone) replaces the customer header. */
const PROVIDER_PATHS = /^\/(provider|messages|requests|profile|notifications)/;
const PROVIDER_TABS_HIDDEN = /^\/(provider\/(new|block|value|company|listings\/\d)|messages\/|requests|login|notifications)/;

function providerKey(path: string): ProviderSidebarKey {
  if (path.startsWith('/requests')) return 'bookings';
  if (path.startsWith('/messages')) return 'messages';
  if (path.startsWith('/profile') || path.startsWith('/provider/company')) return 'profile';
  if (path === '/provider' || path.startsWith('/notifications')) return 'home';
  return 'listings';
}

/** A page's section without ids (`/posts/12` and `/posts/40` share `/posts`): the page fades in when it changes. */
const section = (path: string) => path.split('/').filter((p) => p && !/^\d+$|^[0-9a-f-]{36}$/.test(p)).join('/');

/** Provider chrome: sidebar on desktop, tab bar on phones. */
function ProviderFrame({ unread, onBell }: { unread: number; onBell: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const plan = useBadges()?.plan ?? undefined;
  const quota = plan ? { used: plan.active_posts, total: plan.post_limit } : undefined;
  const key = providerKey(loc.pathname);
  const go = (k: ProviderSidebarKey | ProviderTab) => void nav(k === 'home' ? '/provider' : k === 'listings' ? '/provider/listings' : k === 'bookings' ? '/requests' : `/${k}`);
  const planName = plan ? t(plan.name === 'PROVIDER' ? 'prov.listings.planProvider' : 'prov.listings.planFree') : '';
  return (
    <div className="min-h-dvh md:flex">
      <ProviderSidebar
        active={key}
        onSelect={go}
        onAdd={() => void nav('/provider/new')}
        quota={quota}
        quotaLabel={plan ? t('prov.listings.plan', { plan: planName, used: plan.active_posts, limit: plan.post_limit }) : undefined}
        unread={unread}
      />
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1120px]">
          <div key={section(loc.pathname)} className="zm-fade-in">
            <Outlet context={{ bell: onBell }} />
          </div>
        </div>
        {!PROVIDER_TABS_HIDDEN.test(loc.pathname) && (
          <>
            <div aria-hidden="true" className="h-[96px] md:hidden" />
            <ProviderTabBar active={key === 'bookings' ? 'home' : key} onSelect={go} onAdd={() => void nav('/provider/new')} quota={quota} unread={unread} />
          </>
        )}
      </div>
    </div>
  );
}

/** Phone: tab bar. md and up: the desktop header. */
export function Shell() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = useAuthStore((s) => s.user);
  const [sp] = useSearchParams();
  const unread = useUnread();
  const bellCount = useNotificationUnread();
  const [panel, setPanel] = useState(false);
  const closePanel = useCallback(() => setPanel(false), []);
  useRealtime();
  usePushRegistration();
  useEffect(() => setPanel(false), [loc.pathname]);
  const onBrowse = loc.pathname === '/browse';
  const urlQ = onBrowse ? (sp.get('q') ?? '') : '';
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);

  const submit = (v: string) => {
    const next = new URLSearchParams(onBrowse ? sp : undefined);
    if (v.trim()) next.set('q', v.trim());
    else next.delete('q');
    void nav(`/browse?${next.toString()}`);
  };
  const select = (k: DesktopHeaderKey) => {
    if (k === 'saved') void nav('/saved');
    else if (k === 'messages') void nav('/messages');
    else if (user) setPanel((o) => !o);
    else void nav('/login', { state: { from: loc.pathname + loc.search } });
  };

  const providerMode = !!user && (user.type === 'PROVIDER' ? PROVIDER_PATHS.test(loc.pathname) : loc.pathname.startsWith('/provider'));

  return (
    <div className="min-h-dvh">
      {providerMode ? (
        <ProviderFrame unread={unread} onBell={() => setPanel((o) => !o)} />
      ) : (
        <>
          {user ? (
            <DesktopHeader
              variant="signedIn"
              query={q}
              onQuery={setQ}
              onSubmit={submit}
              active={loc.pathname.startsWith('/saved') ? 'saved' : loc.pathname.startsWith('/messages') ? 'messages' : loc.pathname.startsWith('/notifications') ? 'notifications' : undefined}
              onSelect={select}
              avatarName={user.phone_number}
              unread={unread > 0}
              bellCount={bellCount}
              onAvatar={() => void nav('/profile')}
            />
          ) : (
            <DesktopHeader variant="guest" query={q} onQuery={setQ} onSubmit={submit} onSelect={select} onLogin={() => void nav('/login', { state: { from: loc.pathname + loc.search } })} />
          )}
          <div key={section(loc.pathname)} className="zm-fade-in">
            <Outlet />
          </div>
          {!HIDE_TABS.test(loc.pathname) && (
            <>
              <div aria-hidden="true" className="h-[88px] md:hidden" />
              <CustomerTabBar
                active={tabFor(loc.pathname)}
                unread={unread}
                onSelect={(k) => void nav(k === 'search' ? '/browse' : `/${k}`)}
              />
            </>
          )}
        </>
      )}
      <NotificationPanel open={panel && !!user} onClose={closePanel} />
      <SignInSheet />
      <PushSheet />
      <Toaster />
    </div>
  );
}
