import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listingHealth } from '@zuuchmap/core';
import { ApiError } from '@/lib/api';
import { useCategoryLookup } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useDeleteListing, useListingPerformance, useMyListings, useOwnListing } from '@/lib/provider';
import { useToast } from '@/lib/toast';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { ListingHealthRing } from '@/ui/ListingHealthRing';
import { Modal } from '@/ui/Modal';
import { StatTile } from '@/ui/StatTile';
import { PageHead, ProviderOnly } from './Page';
import { RenewSheet } from './RenewSheet';

const delta = (cur: number, prev: number, t: (k: string, o?: Record<string, unknown>) => string) => {
  if (prev <= 0) return undefined;
  const v = Math.round(((cur - prev) / prev) * 100);
  return v === 0 ? { kind: 'flat' as const, text: t('prov.home.same') } : { kind: v > 0 ? ('up' as const) : ('flat' as const), text: t('prov.home.vsPrev', { change: `${v > 0 ? '+' : ''}${v}%` }) };
};

function Perf() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const id = Number(useParams().id);
  const perf = useListingPerformance(id);
  const own = useOwnListing(id);
  const cats = useCategoryLookup();
  const mineItem = useMyListings().data?.find((p) => p.id === id);
  const del = useDeleteListing();
  const [renew, setRenew] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useDocTitle(t('prov.perf.title'));

  if (perf.isError) {
    const gone = perf.error instanceof ApiError && perf.error.status === 404;
    return <><PageHead title={t('prov.perf.title')} back /><EmptyState icon="circle-alert" title={gone ? t('errors.notFound') : t('customer.browse.loadFailed')} action={{ label: t(gone ? 'prov.tab.listings' : 'common.retry'), onClick: () => (gone ? void nav('/provider/listings') : void perf.refetch()) }} className="py-24" /></>;
  }
  if (!perf.data) return <><PageHead title={t('prov.perf.title')} back /><p role="status" className="p-8 text-center text-caption text-text-secondary">{t('ui.loading')}</p></>;

  const p = perf.data;
  const l = own.data;
  const cat = l ? cats.byKey.get(l.category) : undefined;
  const h = l ? listingHealth({ imageCount: l.images?.length ?? 0, attributes: l.attributes, details: l.details, price: l.price_amount, schema: cat }) : null;
  const hintKey = h?.hint ? `provider.health${h.hint[0].toUpperCase()}${h.hint.slice(1)}` : null;
  const live = l?.approval_status === 'APPROVED';
  const expiring = p.days_left !== null && p.days_left <= 3 && !!l;

  const action = (icon: string, label: string, hint: string | undefined, onClick: () => void, danger = false) => (
    <li>
      <button type="button" onClick={onClick} className={`flex min-h-14 w-full items-center gap-3 rounded-md px-3 text-left focus-visible:outline-none focus-visible:shadow-focus ${danger ? 'text-status-danger' : 'text-text-primary'}`}>
        <Icon name={icon} size={20} className={danger ? 'text-status-danger' : 'text-icon-secondary'} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-bold">{label}</span>
          {hint && <span className="text-caption text-text-secondary">{hint}</span>}
        </span>
        {!danger && <Icon name="chevron-right" size={18} className="text-icon-secondary" />}
      </button>
    </li>
  );

  return (
    <div className="pb-10">
      <PageHead title={t('prov.perf.title')} subtitle={p.title ?? undefined} back />
      <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-4 pt-2 md:mx-0 md:px-8 md:pt-6">
        <p className="flex items-center gap-1.5 text-caption text-text-secondary">
          <Icon name="clock" size={14} />
          {p.days_left !== null ? t('prov.perf.daysLeft', { count: p.days_left }) : t('kit.status.pending')}
        </p>
        <section className="flex flex-col gap-3">
          <h3 className="text-overline text-text-secondary">{t('prov.perf.last7')}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon="eye" label={t('prov.perf.views')} value={p.current.views} delta={delta(p.current.views, p.previous.views, t)} />
            <StatTile icon="bookmark" label={t('prov.perf.saves')} value={p.current.saves} delta={delta(p.current.saves, p.previous.saves, t)} />
            <StatTile icon="phone" label={t('prov.perf.contacts')} value={p.current.contacts} delta={delta(p.current.contacts, p.previous.contacts, t)} />
            <StatTile icon="calendar-range" label={t('prov.perf.requests')} value={p.current.booking_requests} delta={p.pending_requests > 0 ? { kind: 'flat', text: t('prov.perf.pending', { count: p.pending_requests }) } : undefined} />
          </div>
        </section>
        {h && (
          <section className="flex items-center gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
            <ListingHealthRing value={h.score} size={72} label="" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-body-bold text-text-primary">{t('prov.perf.health')}</p>
              <p className="text-caption text-text-secondary">{t('prov.perf.healthPct', { pct: h.score })}</p>
              {hintKey && <p className="text-caption text-text-secondary">{t(hintKey)}</p>}
            </div>
          </section>
        )}
        <ul className="flex flex-col rounded-xl border border-border-subtle bg-bg-surface p-1">
          {action('pencil', t('prov.actions.edit'), live ? t('prov.perf.editNote') : undefined, () => void nav(`/provider/listings/${id}/edit`))}
          {expiring && l && action('refresh-cw', t('prov.home.renew'), t('prov.perf.renewHint', { days: mineItem?.renew_days ?? cat?.post_expiry_days ?? 60 }), () => setRenew(true))}
          {action('star', t('prov.actions.feature'), t('prov.perf.featureHint'), () => toast.info(t('prov.actions.featureSoon')))}
          {action('trash-2', t('prov.perf.deleteListing'), undefined, () => setConfirm(true), true)}
        </ul>
        <Button variant="outline" onClick={() => void nav(`/posts/${id}`)}>{t('ui.prov.viewListing')}</Button>
      </div>
      <RenewSheet target={renew && l ? { id, title: p.title, category: l.category, expires_at: l.expires_at, renew_days: mineItem?.renew_days } : null} onClose={() => setRenew(false)} />
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        destructive
        title={t('prov.actions.deleteTitle')}
        body={t('prov.actions.deleteBody')}
        cancelLabel={t('prov.actions.keep')}
        confirmLabel={t('prov.actions.delete')}
        onConfirm={() => {
          setConfirm(false);
          del.mutate(id, { onSuccess: () => void nav('/provider/listings', { replace: true }) });
        }}
      />
    </div>
  );
}

export default function Performance() {
  return <ProviderOnly><Perf /></ProviderOnly>;
}
