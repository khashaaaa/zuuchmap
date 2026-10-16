import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FEATURED_PACKS, PLAN_MONTHS, type AdminUser, type AdminUserFilter } from '@zuuchmap/core';
import { errorKey } from '@/lib/api';
import { useAdminUser, useAdminUsers, useUserActions } from '@/lib/admin';
import { useCatalogue } from '@/lib/billing';
import { useDocTitle } from '@/lib/meta';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { SearchBar } from '@/ui/SearchBar';
import { Select } from '@/ui/Select';
import { StatusBadge, type Status } from '@/ui/StatusBadge';
import { Switch } from '@/ui/Switch';
import { AdminHead, Panel } from './Frame';

const DAY_MS = 86_400_000;
const nameOf = (u: Pick<AdminUser, 'company' | 'parent_name' | 'given_name' | 'phone_number'>): string =>
  u.company?.name ?? ([u.parent_name, u.given_name].filter(Boolean).join(' ') || u.phone_number || '');
const phoneOf = (p: string | null) => (p ? `${p.slice(0, 4)} ${p.slice(4)}` : '');

function useRole() {
  const { t } = useTranslation();
  return (u: Pick<AdminUser, 'type' | 'is_admin'>) => (u.is_admin ? t('admin.people.admins') : u.type === 'PROVIDER' ? t('admin.people.providers') : t('admin.people.customers'));
}

const FILTERS: Array<{ key: AdminUserFilter | ''; label: string }> = [
  { key: '', label: 'admin.browse.all' },
  { key: 'PROVIDER', label: 'admin.people.providers' },
  { key: 'CUSTOMER', label: 'admin.people.customers' },
  { key: 'ADMIN', label: 'admin.people.admins' },
];

/** Figma J6d: find a user by phone, name or company; filter by role. */
export default function Users() {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const role = useRole();
  const [sp, setSp] = useSearchParams();
  const [text, setText] = useState(sp.get('q') ?? '');
  const type = (sp.get('type') ?? '') as AdminUserFilter | '';
  const q = useAdminUsers(sp.get('q') ?? '', type);
  useDocTitle(t('admin.users'));
  const set = (k: string, v: string) => setSp((s) => { if (v) s.set(k, v); else s.delete(k); return s; }, { replace: true });
  return (
    <div className="pb-10">
      <AdminHead title={t('admin.users')} />
      <div className="flex flex-col gap-3 px-4 md:px-8">
        <SearchBar value={text} onChange={(v) => { setText(v); if (!v) set('q', ''); }} onSubmit={(v) => set('q', v.trim())} placeholder={t('admin.searchUsers')} />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((x) => <Chip key={x.key || 'all'} label={t(x.label)} selected={type === x.key} onClick={() => set('type', x.key)} />)}
        </div>
        <p className="text-small text-text-secondary">{t('admin.people.count', { count: q.data?.total ?? 0 })}</p>
        {q.data?.items.length === 0 ? (
          <EmptyState icon="users" title={t('admin.noUsers')} className="py-12" />
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
            {(q.data?.items ?? []).map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => void nav(`/admin/users/${u.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus">
                  <Avatar name={nameOf(u)} src={u.company?.logo ?? u.profile_picture ?? undefined} size="medium" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-label-strong text-text-primary">
                      {nameOf(u)}
                      {u.company?.is_verified && <Icon name="badge-check" size={14} className="text-icon-accent" />}
                    </p>
                    <p className="truncate text-small text-text-secondary">
                      {[phoneOf(u.phone_number), role(u), u.type === 'PROVIDER' ? (u.plan === 'PROVIDER' ? t('billing.planProvider') : t('billing.planFree')) : t('admin.people.since', { date: f.date(u.date_created).slice(0, 7) })].join(' · ')}
                    </p>
                  </div>
                  {u.type === 'PROVIDER' && <span className="shrink-0 text-small text-text-secondary">{t('admin.people.listingsLine', { count: u.total_posts, live: u.active_posts })}</span>}
                  <Icon name="chevron-right" size={18} className="shrink-0 text-icon-secondary" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const statusOf = (p: { approval_status: string; is_live: boolean; has_pending_edit: boolean; status: string }): Status => {
  if (p.approval_status === 'REJECTED') return 'rejected';
  if (p.approval_status === 'PENDING' || p.has_pending_edit) return 'pending';
  if (!p.is_live) return 'expired';
  return 'live';
};

/** Figma J11d and J13d: company badge, plan, placement, listings, delete. */
export function UserDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const toast = useToast();
  const role = useRole();
  const q = useAdminUser(id);
  const catalogue = useCatalogue();
  const limitOf = (plan: 'FREE' | 'PROVIDER') => catalogue.data?.plans.find((p) => p.plan === plan)?.posts ?? '—';
  const act = useUserActions(id);
  const [months, setMonths] = useState<number>(PLAN_MONTHS[0]);
  const [post, setPost] = useState<number | null>(null);
  const [days, setDays] = useState<number>(FEATURED_PACKS[0]);
  const [grantBadge, setGrantBadge] = useState(false);
  const [remove, setRemove] = useState(false);
  const u = q.data;
  useDocTitle(u ? nameOf(u) : t('admin.users'));
  const fail = (e: unknown) => toast.error(t(errorKey(e)));

  if (q.isError) return <EmptyState icon="users" title={t('errors.codes.USER_NOT_FOUND')} className="py-16" />;
  if (!u) return <div className="p-8"><div className="zm-pulse h-40 rounded-card bg-bg-surface-sunken" /></div>;

  const live = u.posts.filter((p) => p.is_live);
  const target = live.find((p) => p.id === post) ?? live[0] ?? null;
  const left = target?.expires_at ? Math.max(0, Math.ceil((new Date(target.expires_at).getTime() - Date.now()) / DAY_MS)) : null;
  const packs = [...new Set([...FEATURED_PACKS.filter((d) => left === null || d < left), ...(left !== null ? [Math.min(left, 30)] : [])])].filter((d) => d > 0);
  const chosen = left !== null ? Math.min(days, left) : days;
  const planLine = u.plan === 'PROVIDER' && u.plan_expires_at
    ? t('admin.user.planNow', { plan: t('billing.planProvider'), date: f.date(u.plan_expires_at), used: u.active_posts, limit: limitOf('PROVIDER') })
    : t('admin.user.planNowFree', { plan: t('billing.planFree'), used: u.active_posts, limit: limitOf('FREE') });

  return (
    <div className="pb-10">
      <AdminHead
        back={{ label: t('admin.users'), to: '/admin/users' }}
        title={nameOf(u)}
        subtitle={t('admin.user.registered', { phone: phoneOf(u.phone_number), role: role(u), date: f.date(u.date_created) })}
        actions={!u.is_admin && <Button variant="danger" icon="trash-2" onClick={() => setRemove(true)}>{t('admin.user.deleteAction')}</Button>}
      />
      <div className="grid gap-5 px-4 md:px-8 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          {u.company && (
            <Panel>
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-bg-surface-sunken"><Icon name="building-2" size={20} className="text-icon-secondary" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-h3 text-text-primary">{t('admin.user.company')}</h2>
                  <p className="text-small text-text-secondary">
                    {t('admin.user.companyLine', { name: u.company.name, reg: u.company.registration_number ?? '—', tax: u.company.tax_id ?? '—' })}
                  </p>
                </div>
                {u.company.is_verified ? <StatusBadge status="verified" /> : <span className="rounded-sm bg-bg-surface-sunken px-1.5 py-0.5 text-badge text-text-secondary">{t('admin.user.unchecked')}</span>}
              </div>
              <div className="flex items-center gap-3 rounded-md bg-bg-surface-sunken p-3">
                <Icon name="shield-check" size={20} className="shrink-0 text-icon-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="text-label-strong text-text-primary">{t('admin.user.verifiedOrg')}</p>
                  <p className="text-small text-text-secondary">{t('admin.user.verifyHint')}</p>
                </div>
                <Switch
                  label={t('admin.user.verifiedOrg')}
                  checked={!!u.company.is_verified}
                  onChange={(on) => {
                    if (on) setGrantBadge(true);
                    else act.verify.mutate({ companyId: u.company?.id ?? '', verified: false }, { onError: fail });
                  }}
                />
              </div>
              <p className="text-small text-text-secondary">{u.company.is_verified ? t('admin.user.verifiedNote') : t('admin.user.unverifiedNote')}</p>
            </Panel>
          )}
          {u.type === 'PROVIDER' && (
            <Panel title={t('admin.user.plan')}>
              <div className="grid grid-cols-2 gap-2">
                <Select label={t('admin.user.plan')} value="PROVIDER" onChange={() => undefined} options={[{ value: 'PROVIDER', label: t('billing.planProvider') }]} />
                <Select label={t('billing.months')} value={String(months)} onChange={(v) => setMonths(Number(v))} options={PLAN_MONTHS.map((m) => ({ value: String(m), label: t('billing.monthsValue', { count: m }) }))} />
              </div>
              <p className="text-small text-text-secondary">{planLine}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="medium" loading={act.grantPlan.isPending} onClick={() => act.grantPlan.mutate(months, { onSuccess: () => toast.success(t('admin.user.planGranted')), onError: fail })}>{t('admin.grantPlan')}</Button>
                {u.plan === 'PROVIDER' && (
                  <Button size="medium" variant="outline" loading={act.revokePlan.isPending} onClick={() => act.revokePlan.mutate(undefined, { onSuccess: () => toast.success(t('admin.user.planRevoked')), onError: fail })}>{t('admin.revokePlan')}</Button>
                )}
              </div>
            </Panel>
          )}
        </div>
        {u.type === 'PROVIDER' && live.length > 0 && target && (
          <Panel className="self-start">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" size={20} className="text-icon-accent" />
              <h2 className="text-h3 text-text-primary">{t('admin.user.featureTitle')}</h2>
            </div>
            <p className="text-small text-text-secondary">{t('admin.user.featureHint')}</p>
            <Select
              label={t('admin.user.colListing')}
              value={String(target.id)}
              onChange={(v) => setPost(Number(v))}
              options={live.map((p) => ({ value: String(p.id), label: left !== null && p.id === target.id ? t('admin.user.featureListing', { title: p.title ?? '', count: left }) : p.title ?? `#${String(p.id)}` }))}
            />
            <div className="flex flex-wrap gap-2">
              {packs.map((d) => <Chip key={d} label={left !== null && d === left ? t('admin.user.featureMax', { count: d }) : t('billing.featured.daysValue', { count: d })} selected={chosen === d} onClick={() => setDays(d)} />)}
            </div>
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-small text-text-secondary">{t('billing.featuredUntil', { date: f.date(new Date(Date.now() + chosen * DAY_MS)) })}</p>
              <Button size="medium" icon="sparkles" loading={act.feature.isPending} onClick={() => act.feature.mutate({ postId: target.id, days: chosen }, { onSuccess: () => toast.success(t('admin.user.featureGranted')), onError: fail })}>
                {t('admin.user.featureGrant')}
              </Button>
            </div>
          </Panel>
        )}
      </div>
      {u.posts.length > 0 && (
        <section className="flex flex-col gap-2 px-4 pt-6 md:px-8">
          <h2 className="text-overline text-text-secondary">{t('admin.user.listings', { count: u.posts.length })}</h2>
          <div className="overflow-x-auto rounded-card border border-border-subtle bg-bg-surface">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-bg-surface-sunken text-small text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('admin.user.colListing')}</th>
                  <th className="px-4 py-2 font-medium">{t('admin.user.colStatus')}</th>
                  <th className="px-4 py-2 font-medium">{t('admin.user.colViews')}</th>
                  <th className="px-4 py-2 font-medium">{t('admin.user.colEnds')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {u.posts.map((p) => (
                  <tr key={p.id} className="text-body text-text-primary">
                    <td className="px-4 py-3 text-label-strong">{p.title}</td>
                    <td className="px-4 py-3"><StatusBadge status={statusOf(p)} /></td>
                    <td className="px-4 py-3 tabular-nums">{p.views}</td>
                    <td className="px-4 py-3 tabular-nums">{p.expires_at ? f.date(p.expires_at) : '—'}</td>
                    <td className="px-2">
                      <a href={`/posts/${String(p.id)}`} target="_blank" rel="noreferrer" aria-label={p.title ?? ''} className="inline-flex size-10 items-center justify-center rounded-md text-icon-secondary hover:bg-bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus">
                        <Icon name="external-link" size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {u.payments.length > 0 && (
        <section className="flex flex-col gap-2 px-4 pt-6 md:px-8">
          <h2 className="text-overline text-text-secondary">{t('admin.user.payments')}</h2>
          <ul className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle bg-bg-surface">
            {u.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-label text-text-primary">
                  {p.kind === 'PLAN' ? t('billing.rowPlan', { count: p.months }) : t('billing.rowFeatured', { title: p.post_title ?? '', count: p.days ?? 0 })}
                </span>
                <span className="text-small text-text-secondary">{f.date(p.date_created)} · {p.provider === 'MANUAL' ? t('billing.manual') : 'QPay'}</span>
                <span className={cn('text-label-strong tabular-nums', p.status === 'PAID' ? 'text-text-primary' : 'text-text-tertiary')}>{f.amount(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Modal
        open={grantBadge}
        onClose={() => setGrantBadge(false)}
        tone="info"
        title={t('admin.user.grantTitle')}
        body={t('admin.user.grantBody', { company: `${u.company?.name ?? ''} · ${u.company?.registration_number ?? '—'} · ${u.company?.tax_id ?? '—'}` })}
        cancelLabel={t('billing.cancel')}
        confirmLabel={t('admin.user.grant')}
        onConfirm={() => {
          setGrantBadge(false);
          act.verify.mutate({ companyId: u.company?.id ?? '', verified: true }, { onError: fail });
        }}
      />
      <Modal
        open={remove}
        onClose={() => setRemove(false)}
        tone="danger"
        destructive
        title={t('admin.deleteUser')}
        body={t('admin.user.deleteConfirm')}
        cancelLabel={t('billing.cancel')}
        confirmLabel={t('account.delete.confirm')}
        onConfirm={() => {
          setRemove(false);
          act.remove.mutate(undefined, { onSuccess: () => { toast.success(t('admin.user.deleted')); void nav('/admin/users', { replace: true }); }, onError: fail });
        }}
      />
    </div>
  );
}
