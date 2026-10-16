import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MyListingItem } from '@zuuchmap/core';
import { useCategoryLookup } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useToast } from '@/lib/toast';
import { listingFacts, matchesFilter, useDeleteListing, useMyListings, useMyStats, type ListingFacts, type ListingFilter } from '@/lib/provider';
import { useFormat } from '@/lib/useFormat';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Modal } from '@/ui/Modal';
import { MyListingRow } from '@/ui/MyListingRow';
import { QuotaMeter } from '@/ui/TabBar';
import { ListingActionsSheet, type ListingAction } from './ListingActionsSheet';
import { PageHead, ProviderOnly } from './Page';
import { RenewSheet, type RenewTarget } from './RenewSheet';

const FILTERS: ListingFilter[] = ['all', 'live', 'attention', 'draft'];
const FILTER_KEY: Record<ListingFilter, string> = { all: 'prov.listings.filterAll', live: 'prov.listings.filterLive', attention: 'prov.listings.filterAttention', draft: 'prov.listings.filterDraft' };

function Lists() {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const q = useMyListings();
  const stats = useMyStats();
  const cats = useCategoryLookup();
  const del = useDeleteListing();
  const [menu, setMenu] = useState<MyListingItem | null>(null);
  const [confirm, setConfirm] = useState<MyListingItem | null>(null);
  const [renew, setRenew] = useState<RenewTarget | null>(null);
  useDocTitle(t('prov.tab.listings'));

  // A notification about a lapsing listing opens here with `?renew=<id>`: the renew sheet, then the query goes.
  const renewId = Number(sp.get('renew')) || null;
  useEffect(() => {
    if (!renewId || !q.data) return;
    const item = q.data.find((x) => x.id === renewId);
    if (item) setRenew({ id: item.id, title: item.title, category: item.category, expires_at: item.expires_at, renew_days: item.renew_days });
    setSp((p) => {
      p.delete('renew');
      return p;
    }, { replace: true });
  }, [renewId, q.data, setSp]);

  const raw = sp.get('filter');
  const filter: ListingFilter = FILTERS.includes(raw as ListingFilter) ? (raw as ListingFilter) : 'all';
  const rows = useMemo(() => (q.data ?? []).map((item) => ({ item, facts: listingFacts(item) })), [q.data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((k) => [k, rows.filter((r) => matchesFilter(r.facts, k)).length])) as Record<ListingFilter, number>, [rows]);
  const shown = rows.filter((r) => matchesFilter(r.facts, filter));
  const plan = stats.data?.plan;
  const planName = plan ? t(plan.name === 'PROVIDER' ? 'prov.listings.planProvider' : 'prov.listings.planFree') : '';

  const subtitle = q.data
    ? t('ui.prov.summary', { count: rows.length, live: counts.live, pending: rows.filter((r) => r.facts.state === 'pending').length })
    : undefined;

  const statsOf = (id: number) => stats.data?.posts.find((p) => p.id === id);
  const fixing = (facts: ListingFacts) => facts.state === 'rejected' || facts.refusedEdit;
  const edit = (it: MyListingItem, facts: ListingFacts) => void nav(`/provider/listings/${it.id}/edit${fixing(facts) ? '?fix=1' : ''}`);
  const open = (it: MyListingItem, facts: ListingFacts) => (facts.state === 'draft' || fixing(facts) ? edit(it, facts) : void nav(`/posts/${it.id}`));
  const fieldLabel = (it: MyListingItem): string => {
    const key = it.rejection_field;
    if (!key) return '';
    const cf = cats.byKey.get(it.category)?.fields.find((x) => x.key === key);
    if (cf) return cf.label;
    if (key === 'price_amount' || key === 'price_unit') return t('prov.wizard.rowPrice');
    if (key === 'title') return t('prov.wizard.titleLabel');
    if (key === 'details') return t('prov.wizard.details');
    if (key === 'images') return t('prov.wizard.photos');
    return ['province', 'district', 'address', 'latitude', 'longitude', 'location'].includes(key) ? t('prov.wizard.rowLocation') : key;
  };
  const withField = (it: MyListingItem) => [fieldLabel(it), it.rejection_reason ? `“${it.rejection_reason}”` : ''].filter(Boolean).join(': ');

  const card = ({ item, facts }: { item: MyListingItem; facts: ListingFacts }) => {
    const s = statsOf(item.id);
    const cat = cats.byKey.get(item.category);
    const common = {
      title: item.title ?? '',
      categoryKey: item.category,
      categoryIcon: cat?.icon,
      photo: item.images?.[0],
      price: item.price_amount,
      priceUnit: item.price_unit,
      onOpen: () => open(item, facts),
      onMore: () => setMenu(item),
    };
    const renewTarget = () => setRenew({ id: item.id, title: item.title, category: item.category, expires_at: item.expires_at, renew_days: item.renew_days });
    let row;
    switch (facts.state) {
      case 'draft':
        row = (
          <MyListingRow
            {...common}
            status="draft"
            price={item.price_amount}
            meta={[item.price_amount === null ? t('prov.listings.noPrice') : '', t('prov.listings.draftSaved', { age: f.age(item.date_updated) })].filter(Boolean).join(' · ')}
          />
        );
        break;
      case 'rejected':
        row = <MyListingRow {...common} status="rejected" note={`${withField(item)} · ${t('prov.home.fix')}`} />;
        break;
      case 'pending':
        row = <MyListingRow {...common} status="pending" meta={t('prov.listings.reviewing')} />;
        break;
      case 'expired':
        row = (
          <MyListingRow
            {...common}
            status="expired"
            meta={t('prov.listings.expiredOn', { date: f.date(item.expires_at) })}
            action={{ label: t('prov.home.renew'), icon: 'refresh-cw', onClick: renewTarget }}
          />
        );
        break;
      default:
        row = (
          <MyListingRow
            {...common}
            status="live"
            meta={[t('prov.listings.stats', { views: s?.views ?? item.views, saves: s?.saves ?? 0, contacts: s?.contacts ?? 0 }), facts.expiring && facts.daysLeft !== null ? t('prov.perf.daysLeft', { count: facts.daysLeft }) : ''].filter(Boolean).join(' · ')}
            action={facts.expiring ? { label: t('prov.home.renew'), icon: 'refresh-cw', onClick: renewTarget } : { label: t('prov.actions.feature'), icon: 'star', onClick: () => toast.info(t('prov.actions.featureSoon')) }}
          />
        );
    }
    return (
      <li key={item.id} className="flex flex-col gap-2">
        {row}
        {facts.refusedEdit && (
          <Banner tone="danger" title={t('prov.listings.editRefusedTitle', { title: item.title ?? '' })} body={t('prov.listings.editRefusedBody', { reason: item.rejection_reason ?? '' })} action={{ label: t('prov.home.fix'), onClick: () => edit(item, facts) }} />
        )}
        {facts.underReview && <Banner tone="info" title={t('prov.listings.editUnderReviewTitle', { title: item.title ?? '' })} body={t('prov.listings.editUnderReviewBody')} />}
      </li>
    );
  };

  const onAction = (a: ListingAction) => {
    const it = menu;
    if (!it) return;
    const facts = listingFacts(it);
    setMenu(null);
    if (a === 'edit') edit(it, facts);
    else if (a === 'copy') void nav(`/provider/new?copy=${it.id}`);
    else if (a === 'feature') toast.info(t('prov.actions.featureSoon'));
    else if (a === 'block') void nav(`/provider/block?post=${it.id}`);
    else if (a === 'perf') void nav(`/provider/listings/${it.id}/performance`);
    else setConfirm(it);
  };

  const planCard = plan && (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-label-strong text-text-primary">{t('prov.listings.plan', { plan: planName, limit: plan.post_limit, used: plan.active_posts })}</p>
        <button type="button" onClick={() => toast.info(t('ui.prov.planSoon'))} className="inline-flex h-10 items-center text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">{t('prov.listings.upgrade')}</button>
      </div>
      <QuotaMeter used={plan.active_posts} total={plan.post_limit} />
    </div>
  );

  return (
    <div className="pb-8">
      <PageHead title={t('prov.tab.listings')} subtitle={subtitle} />
      <div className="flex flex-col gap-4 px-4 pt-2 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-x-8 md:px-8 md:pt-5">
        <div className="flex min-w-0 flex-col gap-4">
          {q.isError ? (
            <EmptyState icon="refresh-cw" title={t('customer.browse.loadFailed')} body={t('customer.browse.loadFailedBody')} action={{ label: t('common.retry'), onClick: () => void q.refetch() }} />
          ) : q.isPending ? (
            <div className="flex flex-col gap-3" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="zm-pulse h-[104px] rounded-xl bg-bg-surface-sunken" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState icon="plus" title={t('prov.listings.firstTitle')} body={t('prov.listings.firstBody')} action={{ label: t('prov.listings.add'), onClick: () => void nav('/provider/new'), variant: 'secondary' }} className="rounded-xl border border-border-subtle bg-bg-surface py-12" />
          ) : (
            <>
              <div className="zm-noscroll -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label={t('prov.tab.listings')}>
                {FILTERS.map((k) => (
                  <Chip key={k} label={`${t(FILTER_KEY[k])} ${counts[k]}`} selected={filter === k} onClick={() => setSp(k === 'all' ? {} : { filter: k }, { replace: true })} className="shrink-0" />
                ))}
              </div>
              <div className="md:hidden">{planCard}</div>
              {shown.length === 0 ? (
                <p className="py-10 text-center text-caption text-text-secondary">{t('prov.listings.emptyFilter')}</p>
              ) : (
                <ul className="flex flex-col gap-3">{shown.map(card)}</ul>
              )}
            </>
          )}
        </div>
        <aside className="hidden flex-col gap-3 md:flex">
          {planCard}
          <Button variant="secondary" icon="plus" onClick={() => void nav('/provider/new')}>{t('prov.tab.add')}</Button>
        </aside>
      </div>

      <ListingActionsSheet
        item={menu}
        facts={menu ? listingFacts(menu) : null}
        rentable={!!menu && !!cats.byKey.get(menu.category)?.rentable}
        onClose={() => setMenu(null)}
        onPick={onAction}
      />
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        tone="danger"
        destructive
        title={t('prov.actions.deleteTitle')}
        body={t('prov.actions.deleteBody')}
        cancelLabel={t('prov.actions.keep')}
        confirmLabel={t('prov.actions.delete')}
        onConfirm={() => {
          if (confirm) del.mutate(confirm.id);
          setConfirm(null);
        }}
      />
      <RenewSheet target={renew} onClose={() => setRenew(null)} />
    </div>
  );
}

export default function Listings() {
  return <ProviderOnly><Lists /></ProviderOnly>;
}
