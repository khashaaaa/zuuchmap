import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPrice, type AdminListing, type ListingRevision } from '@zuuchmap/core';
import { errorKey } from '@/lib/api';
import { queuedAt, useAdminListings, useApprove, useReject, waited, type QueueStatus } from '@/lib/admin';
import { useCategoryLookup, useOptionLabel, usePlace } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { cn } from '@/lib/cn';
import { Banner } from '@/ui/Banner';
import { BottomSheet } from '@/ui/BottomSheet';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { CategoryTile } from '@/ui/ListingCard';
import { SearchBar } from '@/ui/SearchBar';
import { StatusBadge } from '@/ui/StatusBadge';
import { TextArea } from '@/ui/TextArea';
import { AdminHead } from './Frame';

/** Display rows of an edit: price and place are each one row, whatever parts changed (Figma J2d). */
interface DiffRow { key: string; label: string; before: string; after: string; images?: { before: string[]; after: string[] } }

function useDiffRows(): (p: AdminListing) => DiffRow[] {
  const { t } = useTranslation();
  const place = usePlace();
  const cats = useCategoryLookup();
  const option = useOptionLabel();
  return (p) => {
    const r = p.pending_revision as ListingRevision | null | undefined;
    if (!r) return [];
    const changed = new Set((p.edit_diff ?? []).map((d) => d.field));
    const rows: DiffRow[] = [];
    const str = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : String(v));
    const price = (amount: unknown, unit: string | null) => formatPrice(amount, unit) ?? '—';
    if (changed.has('title')) rows.push({ key: 'title', label: t('prov.wizard.titleLabel'), before: str(p.title), after: str(r.title) });
    if (changed.has('price_amount') || changed.has('price_unit')) {
      rows.push({ key: 'price', label: t('admin.review.price'), before: price(p.price_amount, p.price_unit), after: price(r.price_amount, r.price_unit) });
    }
    if (changed.has('details')) rows.push({ key: 'details', label: t('admin.review.description'), before: str(p.details), after: str(r.details) });
    if (changed.has('subcategory')) {
      const sub = (v: string | null) => cats.byKey.get(p.category)?.subcategories?.find((s) => s.value === v)?.label ?? str(v);
      rows.push({ key: 'subcategory', label: t('prov.wizard.rowCategory'), before: sub(p.subcategory), after: sub(r.subcategory) });
    }
    if (['province', 'district', 'address', 'location', 'latitude', 'longitude'].some((f) => changed.has(f))) {
      const where = (prov: string | null, dist: string | null, addr: string | null) => [place(prov, dist), addr].filter(Boolean).join(' · ') || '—';
      rows.push({ key: 'place', label: t('prov.wizard.rowLocation'), before: where(p.province, p.district, p.address), after: where(r.province, r.district, r.address) });
    }
    for (const [f, label] of [['contact_phone', t('prov.company.phone')], ['contact_email', t('prov.company.email')], ['website', t('prov.company.website')]] as const) {
      if (changed.has(f)) rows.push({ key: f, label, before: str(p[f]), after: str(r[f]) });
    }
    if (changed.has('attributes')) {
      const fields = cats.byKey.get(p.category)?.fields ?? [];
      const a = p.attributes ?? {};
      const b = r.attributes ?? {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
        const f = fields.find((x) => x.key === k);
        const show = (v: unknown) => (Array.isArray(v) ? v.map((x) => option(String(x))).join(', ') : typeof v === 'boolean' ? t(v ? 'customer.detail.yes' : 'customer.detail.no') : typeof v === 'string' ? option(v) : str(v));
        rows.push({ key: `attr.${k}`, label: f?.label ?? k, before: show(a[k]), after: show(b[k]) });
      }
    }
    if (changed.has('images')) {
      rows.push({ key: 'images', label: t('admin.review.photosMore', { count: Math.max(0, r.images.length - (p.images?.length ?? 0)) }), before: '', after: '', images: { before: p.images ?? [], after: r.images } });
    }
    return rows;
  };
}

function Thumb({ p, size = 56 }: { p: AdminListing; size?: number }) {
  const cats = useCategoryLookup();
  const photo = (p.pending_revision as ListingRevision | null | undefined)?.images[0] ?? p.images?.[0];
  return (
    <div className="shrink-0 overflow-hidden rounded-md" style={{ width: size, height: size }}>
      {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <CategoryTile categoryKey={p.category} icon={cats.byKey.get(p.category)?.icon} glyph={size / 2.5} className="size-full" />}
    </div>
  );
}

const ownerName = (p: AdminListing): string => p.user?.company?.name ?? ([p.user?.parent_name, p.user?.given_name].filter(Boolean).join(' ') || p.user?.phone_number || '');

/** Figma J1d: the queue card. */
function QueueCard({ p, active, onOpen }: { p: AdminListing; active: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const edit = !!p.pending_revision;
  const w = waited(queuedAt(p));
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={cn('flex w-full items-center gap-3 rounded-card border bg-bg-surface p-3 text-left focus-visible:outline-none focus-visible:shadow-focus', active ? 'border-border-selected' : 'border-border-subtle hover:border-border-default')}
    >
      <Thumb p={p} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded-sm px-1.5 py-0.5 text-badge', edit ? 'bg-status-warning-tint text-status-warning' : 'bg-status-info-tint text-status-info')}>
            {t(edit ? 'admin.queue.badgeEdit' : 'admin.queue.badgeNew')}
          </span>
        </div>
        <p className="truncate text-label-strong text-text-primary">{(p.pending_revision as ListingRevision | null | undefined)?.title ?? p.title}</p>
        <p className="truncate text-small text-text-secondary">{[ownerName(p), edit ? (p.edit_diff ?? []).map((d) => d.field).slice(0, 2).join(', ') : t('admin.queue.firstListing')].filter(Boolean).join(' · ')}</p>
        <p className="inline-flex items-center gap-1 text-small text-text-secondary">
          <Icon name="clock" size={12} />
          {t(`admin.queue.waited${w.unit === 'minutes' ? 'Minutes' : w.unit === 'hours' ? 'Hours' : 'Days'}`, { count: w.count })}
        </p>
      </div>
      <Icon name="chevron-right" size={18} className="shrink-0 text-icon-secondary" />
    </button>
  );
}

/** Figma J2d (an edit) and J9d (a new listing): what to judge, approve or reject. */
function Review({ p, index, total, onDone }: { p: AdminListing; index: number; total: number; onDone: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const cats = useCategoryLookup();
  const option = useOptionLabel();
  const rows = useDiffRows()(p);
  const approve = useApprove();
  const [rejecting, setRejecting] = useState(false);
  const edit = !!p.pending_revision;

  const doApprove = () => approve.mutate(p.id, { onSuccess: () => { toast.success(t('admin.review.approved')); onDone(); }, onError: (e) => toast.error(t(errorKey(e))) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rejecting || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      if ((e.key === 'a' || e.key === 'A') && !approve.isPending) doApprove();
      if (e.key === 'r' || e.key === 'R') setRejecting(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fields = cats.byKey.get(p.category)?.fields ?? [];
  const specs = Object.entries(p.attributes ?? {}).map(([k, v]) => {
    const fd = fields.find((x) => x.key === k);
    const val = Array.isArray(v) ? v.map((x) => option(String(x))).join(', ') : typeof v === 'boolean' ? t(v ? 'customer.detail.yes' : 'customer.detail.no') : typeof v === 'string' ? option(v) : String(v);
    return { label: fd?.label ?? k, value: fd?.unit ? `${val} ${fd.unit}` : val };
  });
  const price = f.priceParts(p.price_amount, p.price_unit);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setRejecting(true)}>{t('admin.review.reject')}</Button>
        <Button onClick={doApprove} loading={approve.isPending}>{edit ? t('admin.approveEdit') : t('admin.review.approve')}</Button>
        <p className="ml-auto hidden items-center gap-2 text-small text-text-secondary lg:flex">
          <kbd className="rounded-sm border border-border-default px-1.5">A</kbd>{t('admin.review.keyApprove')}
          <kbd className="rounded-sm border border-border-default px-1.5">R</kbd>{t('admin.review.keyReject')}
          <kbd className="rounded-sm border border-border-default px-1.5">J / K</kbd>{t('admin.review.keyNext')}
        </p>
      </div>
      <hr className="border-border-subtle" />
      <div>
        <p className="text-small text-text-secondary">{t('admin.review.position', { index, total })}</p>
        <h2 className="text-h2 text-text-primary">{edit ? t('admin.review.editHeading') : t('admin.review.newTitle')}</h2>
        {edit && <p className="text-body text-text-secondary">{t('admin.review.editSub')}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Thumb p={p} size={64} />
        <div className="min-w-0">
          <p className="text-title text-text-primary">{(p.pending_revision as ListingRevision | null | undefined)?.title ?? p.title}</p>
          <p className="inline-flex items-center gap-1 text-caption text-text-secondary">
            {ownerName(p)}
            {p.user?.company?.is_verified && <Icon name="badge-check" size={14} className="text-icon-accent" />}
          </p>
        </div>
      </div>
      {edit ? (
        <>
          <Banner tone="info" title={t('admin.review.liveNote')} body={t('admin.review.liveHint')} />
          <p className="text-small text-text-secondary">{t('admin.review.changed', { count: rows.length })}</p>
          {rows.map((r) => (
            <section key={r.key} className="flex flex-col gap-2 rounded-card bg-bg-surface p-4">
              <h3 className="text-label-strong text-text-primary">{r.label}</h3>
              {r.images ? (
                <div className="flex flex-wrap gap-2">
                  {r.images.after.map((src) => (
                    <img key={src} src={src} alt="" className={cn('size-14 rounded-md object-cover', !r.images?.before.includes(src) && 'ring-2 ring-status-success')} />
                  ))}
                </div>
              ) : (
                <>
                  <p className="flex gap-2 rounded-md bg-status-danger-tint px-3 py-2 text-body text-text-secondary"><span aria-hidden="true" className="text-status-danger">−</span><span className="line-through">{r.before}</span></p>
                  <p className="flex gap-2 rounded-md bg-status-success-tint px-3 py-2 text-body text-text-primary"><span aria-hidden="true" className="text-status-success">+</span><span>{r.after}</span></p>
                </>
              )}
            </section>
          ))}
        </>
      ) : (
        <>
          <Banner tone="info" title={t('admin.review.newNote')} body={t('admin.review.newHint')} />
          {specs.length > 0 && (
            <section className="flex flex-col gap-2 rounded-card bg-bg-surface p-4">
              <h3 className="text-label-strong text-text-primary">{t('admin.review.specs')}</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {specs.map((s) => (
                  <div key={s.label}>
                    <dt className="text-small text-text-secondary">{s.label}</dt>
                    <dd className="text-label-strong text-text-primary">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className="flex flex-col gap-1 rounded-card bg-bg-surface p-4">
            <h3 className="text-label-strong text-text-primary">{t('admin.review.price')}</h3>
            <p className="text-body text-text-primary">{price ? `${price.amount}${price.unit ? ` / ${price.unit}` : ''}` : '—'}</p>
          </section>
          {p.details && (
            <section className="flex flex-col gap-1 rounded-card bg-bg-surface p-4">
              <h3 className="text-label-strong text-text-primary">{t('admin.review.description')}</h3>
              <p className="whitespace-pre-wrap text-body text-text-secondary">{p.details}</p>
            </section>
          )}
          {(p.images?.length ?? 0) > 0 && (
            <section className="flex flex-col gap-2 rounded-card bg-bg-surface p-4">
              <h3 className="text-label-strong text-text-primary">{t('admin.review.photos')}</h3>
              <div className="flex flex-wrap gap-2">{p.images?.map((src) => <img key={src} src={src} alt="" className="size-20 rounded-md object-cover" />)}</div>
            </section>
          )}
        </>
      )}
      <RejectSheet p={rejecting ? p : null} onClose={() => setRejecting(false)} onDone={onDone} />
    </div>
  );
}

const FIELD_CHOICES: Array<{ key: string | null; label: string }> = [
  { key: 'price_amount', label: 'admin.review.price' },
  { key: 'details', label: 'admin.review.description' },
  { key: 'images', label: 'admin.review.photos' },
  { key: 'subcategory', label: 'prov.wizard.rowCategory' },
  { key: 'title', label: 'prov.wizard.titleLabel' },
  { key: null, label: 'admin.reject.whole' },
];
const REASONS = ['poorImage', 'incomplete', 'wrongCategory', 'noContact', 'wrongPrice', 'duplicate'];

/** Figma J3d: point at the field to fix, give the reason the provider will read. */
function RejectSheet({ p, onClose, onDone }: { p: AdminListing | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const reject = useReject();
  const [field, setField] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    setField(null);
    setPreset(null);
    setText('');
  }, [p?.id]);
  const reason = preset === 'other' ? text.trim() : preset ? t(`admin.reasonTypes.${preset}`) : '';
  const submit = () => {
    if (!p || !reason) return;
    reject.mutate({ id: p.id, reason, field_key: field }, {
      onSuccess: () => {
        toast.success(t('admin.review.rejected'));
        onClose();
        onDone();
      },
      onError: (e) => toast.error(t(errorKey(e))),
    });
  };
  return (
    <BottomSheet
      open={!!p}
      onClose={onClose}
      title={t('admin.reject.what')}
      primary={{ label: p?.pending_revision ? t('admin.reject.submitEdit') : t('admin.reject.submitNew'), onClick: submit, disabled: !reason || reject.isPending }}
    >
      <p className="text-small text-text-secondary">{t('admin.reject.whatHint')}</p>
      <div className="flex flex-wrap gap-2">
        {FIELD_CHOICES.map((c) => <Chip key={c.key ?? 'whole'} label={t(c.label)} selected={field === c.key} onClick={() => setField(c.key)} />)}
      </div>
      <p className="text-label-strong text-text-primary">{t('admin.reject.reason')}</p>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => <Chip key={r} label={t(`admin.reasonTypes.${r}`)} selected={preset === r} onClick={() => setPreset(r)} />)}
        <Chip label={t('admin.reject.other')} selected={preset === 'other'} onClick={() => setPreset('other')} />
      </div>
      {preset === 'other' && <TextArea label={t('admin.reject.reason')} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />}
      {reason && <p className="rounded-md bg-bg-surface-sunken px-3 py-2 text-caption text-text-secondary">“{reason}”</p>}
      <p className="text-small text-text-secondary">{t('admin.rejectNotice')}</p>
    </BottomSheet>
  );
}

/** Figma J1d + J2d: the queue beside the item under review; J/K walk it. */
function Queue() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const q = useAdminListings('PENDING', '', 1, 100);
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const id = Number(sp.get('id')) || null;
  const index = items.findIndex((p) => p.id === id);
  const current = index >= 0 ? items[index] : null;
  const open = (pid: number | null) => setSp((s) => { if (pid) s.set('id', String(pid)); else s.delete('id'); return s; }, { replace: true });

  // Desktop starts on the oldest item; a phone shows the list until one is tapped.
  useEffect(() => {
    if (!current && items.length && window.matchMedia('(min-width: 1024px)').matches) open(items[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the queue changes
  }, [items, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || !items.length) return;
      const step = e.key === 'j' || e.key === 'J' ? 1 : e.key === 'k' || e.key === 'K' ? -1 : 0;
      if (!step) return;
      const next = items[Math.min(items.length - 1, Math.max(0, (index < 0 ? 0 : index) + step))];
      open(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const afterDecision = () => {
    const next = items[index + 1] ?? items[index - 1] ?? null;
    open(next && next.id !== id ? next.id : null);
  };

  if (q.isPending) return <div className="px-4 md:px-8"><div className="zm-pulse h-40 rounded-card bg-bg-surface-sunken" /></div>;
  if (!items.length) return <EmptyState icon="shield-check" title={t('admin.noPending')} body={t('admin.noPendingDesc')} className="py-16" />;
  return (
    <div className="grid gap-6 px-4 md:px-8 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className={cn('flex min-w-0 flex-col gap-2', current && 'hidden lg:flex')}>
        <p className="text-small text-text-secondary">{t('admin.queue.desktopSub', { count: q.data?.total ?? items.length })}</p>
        {items.map((p) => <QueueCard key={p.id} p={p} active={p.id === id} onOpen={() => open(p.id)} />)}
      </div>
      <div className={cn('min-w-0', !current && 'hidden lg:block')}>
        {current ? (
          <>
            <button type="button" onClick={() => open(null)} className="mb-3 inline-flex h-10 items-center gap-1 text-label-strong text-text-link lg:hidden">
              <Icon name="arrow-left" size={16} />
              {t('admin.queue.desktopTitle')}
            </button>
            <Review key={current.id} p={current} index={index + 1} total={items.length} onDone={afterDecision} />
          </>
        ) : (
          <EmptyState icon="list" title={t('admin.review.pick')} className="py-16" />
        )}
      </div>
    </div>
  );
}

const FILTERS: Array<{ key: QueueStatus; label: string }> = [
  { key: '', label: 'admin.browse.all' },
  { key: 'PENDING', label: 'admin.browse.pending' },
  { key: 'APPROVED', label: 'admin.dash.approved' },
  { key: 'REJECTED', label: 'admin.dash.rejected' },
];

/** Figma J5d: every listing by title, owner phone or category, newest first. */
function AllListings() {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const place = usePlace();
  const [sp, setSp] = useSearchParams();
  const [text, setText] = useState(sp.get('q') ?? '');
  const status = (sp.get('status') ?? '') as QueueStatus;
  const q = useAdminListings(status, sp.get('q') ?? '', Number(sp.get('page')) || 1, 50);
  const pending = useAdminListings('PENDING', '', 1, 1);
  const set = (k: string, v: string) => setSp((s) => { if (v) s.set(k, v); else s.delete(k); s.delete('page'); return s; }, { replace: true });

  const badge = (p: AdminListing) => {
    if (p.approval_status === 'REJECTED') return <StatusBadge status="rejected" />;
    if (p.approval_status === 'PENDING' || p.pending_revision) return <StatusBadge status="pending" />;
    if (p.status === 'EXPIRED' || (p.expires_at && new Date(p.expires_at).getTime() < Date.now())) return <StatusBadge status="expired" />;
    return <StatusBadge status="live" />;
  };
  const meta = (p: AdminListing): string => {
    if (p.approval_status === 'REJECTED') return p.rejection_reason ? `“${p.rejection_reason}”` : '';
    if (p.pending_revision) return t('admin.browse.edited', { time: f.age(queuedAt(p)) });
    if (p.approval_status === 'PENDING') return t('admin.queue.firstListing');
    if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) return t('admin.browse.endedOn', { date: f.date(p.expires_at) });
    return t('admin.browse.live', { count: p.views });
  };

  return (
    <div className="flex flex-col gap-3 px-4 md:px-8">
      <SearchBar value={text} onChange={(v) => { setText(v); if (!v) set('q', ''); }} onSubmit={(v) => set('q', v.trim())} placeholder={t('admin.browse.placeholder')} />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Chip key={x.key || 'all'} label={x.key === 'PENDING' && pending.data ? `${t(x.label)} · ${String(pending.data.total)}` : t(x.label)} selected={status === x.key} onClick={() => set('status', x.key)} />
        ))}
      </div>
      <p className="text-small text-text-secondary">{t('admin.browse.count', { count: q.data?.total ?? 0 })}</p>
      <ul className="flex flex-col gap-2">
        {(q.data?.items ?? []).map((p) => {
          const price = f.priceParts(p.price_amount, p.price_unit);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void nav(p.approval_status === 'PENDING' || p.pending_revision ? `/admin/listings?id=${String(p.id)}` : `/posts/${String(p.id)}`)}
                className="flex w-full items-center gap-3 rounded-card border border-border-subtle bg-bg-surface p-3 text-left hover:border-border-default focus-visible:outline-none focus-visible:shadow-focus"
              >
                <Thumb p={p} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label-strong text-text-primary">{p.title}</p>
                  <p className="truncate text-small text-text-secondary">{[place(p.province, p.district), ownerName(p)].filter(Boolean).join(' · ')}</p>
                  <p className="truncate text-small text-text-secondary">{meta(p)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {price && <span className="text-label-strong text-text-primary tabular-nums">{price.amount}{price.unit && <span className="text-small text-text-secondary"> / {price.unit}</span>}</span>}
                  {badge(p)}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {q.data && q.data.total > (Number(sp.get('page')) || 1) * 50 && (
        <Button variant="outline" className="self-center" onClick={() => setSp((s) => { s.set('page', String((Number(s.get('page')) || 1) + 1)); return s; })}>{t('customer.landing.seeAll')}</Button>
      )}
    </div>
  );
}

export default function AdminListings() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const all = sp.get('tab') === 'all';
  useDocTitle(all ? t('admin.browse.title') : t('admin.queue.desktopTitle'));
  return (
    <div className="pb-10">
      <AdminHead
        title={all ? t('admin.browse.title') : t('admin.queue.desktopTitle')}
        actions={
          <div className="flex gap-2">
            <Chip label={t('admin.queue.title')} selected={!all} onClick={() => setSp({}, { replace: true })} />
            <Chip label={t('admin.browse.all')} selected={all} onClick={() => setSp({ tab: 'all' }, { replace: true })} />
          </div>
        }
      />
      {all ? <AllListings /> : <Queue />}
    </div>
  );
}
