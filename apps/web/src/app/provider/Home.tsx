import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MyListingItem, PerformanceWindow } from '@zuuchmap/core';
import { useAuthStore } from '@/lib/auth';
import { useCategoryLookup } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useNotificationUnread } from '@/lib/notifications';
import { askForPush, usePushPermission } from '@/lib/push';
import { listingFacts, useMyListings, useProfile, useProviderHome } from '@/lib/provider';
import { useFormat } from '@/lib/useFormat';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { StatTile } from '@/ui/StatTile';
import { StatusBadge } from '@/ui/StatusBadge';
import { TaskCard } from '@/ui/TaskCard';
import { PageHead, ProviderOnly, SectionTitle } from './Page';
import { RenewSheet, type RenewTarget } from './RenewSheet';

const pct = (cur: number, prev: number): number | null => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

function Failed({ retry }: { retry: () => void }) {
  const { t } = useTranslation();
  return <EmptyState icon="refresh-cw" title={t('customer.browse.loadFailed')} body={t('customer.browse.loadFailedBody')} action={{ label: t('common.retry'), onClick: retry }} className="py-24" />;
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-3 md:px-8" aria-hidden="true">
      {[0, 1, 2].map((i) => <div key={i} className="zm-pulse h-[88px] rounded-xl bg-bg-surface-sunken" />)}
    </div>
  );
}

function Home() {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const me = useAuthStore((s) => s.user);
  const profile = useProfile();
  const home = useProviderHome();
  const mine = useMyListings();
  const cats = useCategoryLookup();
  const [renew, setRenew] = useState<RenewTarget | null>(null);
  const bell = useNotificationUnread();
  const permission = usePushPermission();
  useDocTitle(t('prov.tab.home'));

  const company = home.data?.company;
  const name = profile.data?.given_name ?? company?.name ?? me?.phone_number ?? '';
  const subtitle = [company?.name, f.date(new Date())].filter(Boolean).join(' · ');

  if (home.isError) return <><PageHead title={t('prov.tab.home')} /><Failed retry={() => void home.refetch()} /></>;
  if (!home.data) return <><PageHead title={t('prov.tab.home')} /><Skeleton /></>;

  const h = home.data;
  const byId = new Map<number, MyListingItem>((mine.data ?? []).map((p) => [p.id, p]));
  const fieldName = (key: string | null, categoryKey?: string): string => {
    if (!key) return '';
    const cat = categoryKey ? cats.byKey.get(categoryKey) : undefined;
    const cf = cat?.fields.find((x) => x.key === key);
    if (cf) return cf.label;
    if (key === 'price_amount' || key === 'price_unit') return t('prov.wizard.rowPrice');
    if (key === 'title') return t('prov.wizard.titleLabel');
    if (key === 'details') return t('prov.wizard.details');
    if (key === 'images') return t('prov.wizard.photos');
    if (['province', 'district', 'address', 'latitude', 'longitude', 'location'].includes(key)) return t('prov.wizard.rowLocation');
    return key;
  };

  const tasks: { key: string; node: React.ReactNode }[] = [];
  if (h.pending_requests.count > 0) {
    tasks.push({
      key: 'requests',
      node: (
        <TaskCard
          type="request"
          title={t('prov.home.requests', { count: h.pending_requests.count })}
          subtitle={h.pending_requests.oldest_at ? t('prov.home.oldest', { age: f.age(h.pending_requests.oldest_at) }) : ''}
          actionLabel={t('prov.home.view')}
          onAction={() => void nav('/requests')}
        />
      ),
    });
  }
  for (const x of h.to_fix) {
    const item = byId.get(x.id);
    tasks.push({
      key: `fix${x.id}`,
      node: (
        <TaskCard
          type="rejected"
          title={t(x.revision ? 'prov.home.editRefused' : 'prov.home.rejected', { title: x.title ?? '' })}
          subtitle={x.rejection_reason ? t('prov.home.fieldReason', { field: fieldName(x.rejection_field, item?.category), reason: x.rejection_reason }) : ''}
          actionLabel={t('prov.home.fix')}
          onAction={() => void nav(`/provider/listings/${x.id}/edit?fix=1`)}
        />
      ),
    });
  }
  if (h.unread_chats.count > 0) {
    const m = h.unread_chats.reply_minutes;
    tasks.push({
      key: 'chats',
      node: (
        <TaskCard
          type="chat"
          title={t('prov.home.unread', { count: h.unread_chats.count })}
          subtitle={typeof m === 'number' ? t('prov.home.avgReply', { time: t(m < 60 ? 'deal.replyMinutes' : m < 1440 ? 'deal.replyHours' : 'deal.replyDays', { count: m < 60 ? m : m < 1440 ? Math.round(m / 60) : Math.round(m / 1440) }) }) : ''}
          actionLabel={t('prov.home.reply')}
          onAction={() => void nav('/messages')}
        />
      ),
    });
  }
  if (h.expiring.length > 0) {
    const soonest = Math.min(...h.expiring.map((e) => Math.max(0, Math.ceil((new Date(e.expires_at).getTime() - Date.now()) / 86_400_000))));
    const only = h.expiring.length === 1 ? h.expiring[0] : null;
    tasks.push({
      key: 'expiring',
      node: (
        <TaskCard
          type="expiring"
          title={t('prov.home.expiring', { count: h.expiring.length, days: soonest })}
          subtitle={t('prov.home.expiringBody')}
          actionLabel={t('prov.home.renew')}
          onAction={() => {
            const item = only ? byId.get(only.id) : undefined;
            if (only && item) setRenew({ id: only.id, title: only.title, category: item.category, expires_at: only.expires_at, renew_days: item.renew_days });
            else void nav('/provider/listings?filter=attention');
          }}
        />
      ),
    });
  }
  if (h.unanswered_reviews > 0 && me) {
    tasks.push({
      key: 'reviews',
      node: <TaskCard type="review" title={t('prov.home.reviews', { count: h.unanswered_reviews })} subtitle="" actionLabel={t('prov.home.reply')} onAction={() => void nav(`/sellers/${me.id}/reviews`)} />,
    });
  }

  const cur: PerformanceWindow = h.week.totals.current;
  const prev: PerformanceWindow = h.week.totals.previous;
  const delta = (c: number, p: number) => {
    const v = pct(c, p);
    if (v === null) return undefined;
    if (v === 0) return { kind: 'flat' as const, text: t('prov.home.same') };
    return { kind: v > 0 ? ('up' as const) : ('flat' as const), text: t('prov.home.vsPrev', { change: `${v > 0 ? '+' : ''}${v}%` }) };
  };
  const top = h.week.posts.filter((p) => byId.has(p.id)).slice(0, 5);

  return (
    <div className="pb-8">
      <PageHead title={t('prov.home.greeting', { name })} subtitle={subtitle} action={{ icon: 'bell', label: t('notif.title'), badge: bell, onClick: () => void nav('/notifications') }} />
      {/* E11: a provider who cannot be reached sees it before anything else. */}
      {permission === 'default' && (
        <Banner tone="info" title={t('prov.home.notifOffTitle')} body={t('prov.home.notifOffBody')} action={{ label: t('prov.home.turnOn'), onClick: () => void askForPush('post', { force: true }) }} className="mx-4 mt-2 md:mx-8 md:mt-4" />
      )}
      {permission === 'denied' && <Banner tone="warning" title={t('push.blockedTitle')} body={t('push.blockedBody')} className="mx-4 mt-2 md:mx-8 md:mt-4" />}
      <div className="flex flex-col gap-6 px-4 pt-2 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-x-8 md:px-8 md:pt-6">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <SectionTitle>{tasks.length > 0 ? t('prov.home.waiting', { count: tasks.length }) : t('prov.home.allDone')}</SectionTitle>
            {tasks.length === 0 ? (
              <EmptyState icon="circle-check" title={t('prov.home.allDone')} className="rounded-xl border border-border-subtle bg-bg-surface py-8" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">{tasks.map((x) => <div key={x.key} className="contents">{x.node}</div>)}</div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle action={{ label: t('ui.prov.toListings'), onClick: () => void nav('/provider/listings') }}>{t('ui.prov.perListing')}</SectionTitle>
            {top.length === 0 ? (
              <p className="text-caption text-text-secondary">{t('prov.listings.emptyFilter')}</p>
            ) : (
              <>
                <ul className="flex flex-col gap-2 md:hidden">
                  {top.map((p) => {
                    const item = byId.get(p.id);
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => void nav(`/provider/listings/${p.id}/performance`)} className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-bg-surface p-3 text-left focus-visible:outline-none focus-visible:shadow-focus">
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 block text-body-bold text-text-primary">{p.title}</span>
                            <span className="block text-small text-text-secondary">{item ? `${t('prov.home.views')} ${p.current.views} · ${t('prov.home.contacts')} ${p.current.contacts}` : ''}</span>
                          </span>
                          <Icon name="chevron-right" size={18} className="text-icon-secondary" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden overflow-hidden rounded-xl border border-border-subtle bg-bg-surface md:block">
                  <table className="w-full table-fixed text-left">
                    <thead className="bg-bg-surface-sunken text-overline text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-normal">{t('prov.wizard.titleLabel')}</th>
                        <th className="w-[150px] px-2 py-3 font-normal">{t('ui.prov.status')}</th>
                        <th className="w-[72px] px-2 py-3 text-right font-normal">{t('prov.home.views')}</th>
                        <th className="w-[92px] px-2 py-3 text-right font-normal">{t('prov.perf.saves')}</th>
                        <th className="w-[92px] px-2 py-3 text-right font-normal">{t('prov.home.contacts')}</th>
                        <th className="w-[116px] px-4 py-3 text-right font-normal">{t('ui.prov.ends')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top.map((p) => {
                        const item = byId.get(p.id);
                        const facts = item && listingFacts(item);
                        return (
                          <tr key={p.id} className="cursor-pointer border-t border-border-subtle hover:bg-bg-surface-sunken" onClick={() => void nav(`/provider/listings/${p.id}/performance`)}>
                            <td className="truncate px-4 py-3 text-body-bold text-text-primary">{p.title}</td>
                            <td className="px-2 py-3">{facts && <StatusBadge status={facts.state} />}</td>
                            <td className="px-2 py-3 text-right tabular-nums">{p.current.views}</td>
                            <td className="px-2 py-3 text-right tabular-nums">{p.current.saves}</td>
                            <td className="px-2 py-3 text-right tabular-nums">{p.current.contacts}</td>
                            <td className="px-4 py-3 text-right text-caption text-text-secondary">{item?.expires_at ? f.date(item.expires_at) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-3 md:order-last">
          <button
            type="button"
            onClick={() => void nav('/provider/value')}
            className="flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-bg-surface px-4 py-3.5 text-left focus-visible:outline-none focus-visible:shadow-focus"
          >
            <span className="flex items-center gap-1.5 text-small text-text-secondary"><Icon name="credit-card" size={16} />{t('prov.home.bookingValue')}</span>
            <span className="text-h2 tabular-nums text-text-primary">{f.amount(h.booking_value.total) ?? '0₮'}</span>
            <span className="text-small text-status-success">{t('prov.home.confirmed', { count: h.booking_value.count })}</span>
          </button>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            <StatTile icon="eye" label={t('prov.home.views')} value={cur.views} delta={delta(cur.views, prev.views)} />
            <StatTile icon="phone" label={t('prov.home.contacts')} value={cur.contacts} delta={delta(cur.contacts, prev.contacts)} />
          </div>
          <Button variant="outline" size="medium" icon="calendar-x" onClick={() => void nav('/provider/block')}>{t('prov.actions.blockDays')}</Button>
        </aside>
      </div>
      <RenewSheet target={renew} fromReminder onClose={() => setRenew(null)} />
    </div>
  );
}

export default function ProviderHome() {
  return <ProviderOnly><Home /></ProviderOnly>;
}

