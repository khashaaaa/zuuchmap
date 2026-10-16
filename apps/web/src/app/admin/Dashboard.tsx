import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { groupThousands, type BroadcastAudience } from '@zuuchmap/core';
import { errorKey } from '@/lib/api';
import { useBroadcast, useBroadcastEstimate, useOverview, waited } from '@/lib/admin';
import { useCategoryLookup } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useToast } from '@/lib/toast';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Select } from '@/ui/Select';
import { StatTile } from '@/ui/StatTile';
import { TextArea } from '@/ui/TextArea';
import { TextField } from '@/ui/TextField';
import { AdminHead, Panel } from './Frame';

const pct = (n: number, of: number): string => (of > 0 ? `${String(Math.round((n / of) * 100))}%` : '—');

/** Live listings per category as bars, longest first (Figma J10d "Ангиллаар"). */
export function CategoryBars({ rows }: { rows: Array<{ key: string; count: number }> }) {
  const cats = useCategoryLookup();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)_48px] items-center gap-3">
          <span className="truncate text-label text-text-primary">{cats.byKey.get(r.key)?.label ?? r.key}</span>
          <span className="h-2 overflow-hidden rounded-pill bg-bg-surface-sunken">
            <span className="block h-full rounded-pill bg-action-primary" style={{ width: `${String((r.count / max) * 100)}%` }} />
          </span>
          <span className="text-right text-label-strong text-text-primary tabular-nums">{groupThousands(r.count)}</span>
        </li>
      ))}
    </ul>
  );
}

function Broadcast() {
  const { t } = useTranslation();
  const toast = useToast();
  const cats = useCategoryLookup();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>('CUSTOMER');
  const [category, setCategory] = useState('');
  const [confirm, setConfirm] = useState(false);
  const estimate = useBroadcastEstimate({ audience, category: category || null });
  const send = useBroadcast();
  const devices = estimate.data?.devices ?? 0;
  const ready = title.trim() !== '' && body.trim() !== '';

  return (
    <Panel className="md:sticky md:top-8">
      <div className="flex items-center gap-2">
        <Icon name="send" size={20} className="text-icon-accent" />
        <h2 className="text-h3 text-text-primary">{t('admin.cast.title')}</h2>
      </div>
      <p className="text-small text-text-secondary">{t('admin.cast.hint')}</p>
      <TextField label={t('admin.cast.heading')} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      <TextArea label={t('admin.cast.body')} value={body} maxLength={300} rows={3} onChange={(e) => setBody(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Select
          label={t('admin.cast.audience')}
          value={audience}
          onChange={(v) => setAudience(v as BroadcastAudience)}
          options={[
            { value: 'ALL', label: t('admin.cast.everyone') },
            { value: 'CUSTOMER', label: t('admin.people.customers') },
            { value: 'PROVIDER', label: t('admin.people.providers') },
          ]}
        />
        <Select
          label={t('admin.cast.category')}
          value={category}
          onChange={setCategory}
          options={[{ value: '', label: t('analytics.allCategories') }, ...cats.list.map((c) => ({ value: c.key, label: c.label }))]}
        />
      </div>
      <p className="text-small text-text-secondary">{t('admin.cast.reach', { count: devices })}</p>
      <Button icon="send" disabled={!ready || devices === 0} onClick={() => setConfirm(true)}>{t('admin.cast.send')}</Button>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="warning"
        title={t('admin.cast.confirmTitle')}
        body={t('admin.cast.confirmBody')}
        cancelLabel={t('admin.cast.cancel')}
        confirmLabel={t('admin.cast.send')}
        onConfirm={() => {
          setConfirm(false);
          send.mutate({ title: title.trim(), body: body.trim(), audience, category: category || null }, {
            onSuccess: (r) => {
              toast.success(t('admin.cast.sent', { count: r.devices }));
              setTitle('');
              setBody('');
            },
            onError: (e) => toast.error(t(errorKey(e))),
          });
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 rounded-md bg-bg-surface-sunken p-3">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-action-primary text-action-on-primary"><Icon name="bell" size={16} /></span>
            <div className="min-w-0">
              <p className="text-small text-text-secondary">{t('admin.cast.previewApp')}</p>
              <p className="text-label-strong text-text-primary">{title}</p>
              <p className="text-caption text-text-secondary">{body}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption">
            <dt className="text-text-secondary">{t('admin.cast.audience')}</dt>
            <dd className="text-text-primary">{audience === 'ALL' ? t('admin.cast.everyone') : audience === 'CUSTOMER' ? t('admin.people.customers') : t('admin.people.providers')}</dd>
            <dt className="text-text-secondary">{t('admin.cast.category')}</dt>
            <dd className="text-text-primary">{category ? cats.byKey.get(category)?.label ?? category : t('analytics.allCategories')}</dd>
            <dt className="text-text-secondary">{t('admin.cast.devices')}</dt>
            <dd className="text-text-primary">≈ {groupThousands(devices)}</dd>
          </dl>
        </div>
      </Modal>
    </Panel>
  );
}

/** Figma J10d: listings and users at a glance, live listings by category, and the broadcast. */
export default function Dashboard() {
  const { t } = useTranslation();
  const o = useOverview();
  useDocTitle(t('admin.dash.title'));
  const d = o.data;
  const wait = d?.posts.oldest_pending_at ? waited(d.posts.oldest_pending_at) : null;
  return (
    <div className="pb-10">
      <AdminHead title={t('admin.dash.title')} subtitle={t('admin.dash.subtitle')} />
      <div className="grid gap-6 px-4 md:grid-cols-[minmax(0,1fr)_320px] md:px-8">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="text-overline text-text-secondary">{t('admin.dash.listings')}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile icon="eye" label={t('admin.dash.totalListings')} value={d ? groupThousands(d.posts.total) : '—'} delta={d ? { kind: 'up', text: t('analytics.newThisWeek', { count: d.posts.new_7d }) } : undefined} />
              <StatTile icon="eye" label={t('admin.browse.pending')} value={d ? groupThousands(d.posts.pending) : '—'} delta={wait ? { kind: 'flat', text: t('analytics.oldestWait', { time: t(`admin.queue.${wait.unit}`, { count: wait.count }) }) } : undefined} />
              <StatTile icon="eye" label={t('admin.dash.approved')} value={d ? groupThousands(d.posts.approved) : '—'} delta={d ? { kind: 'up', text: pct(d.posts.approved, d.posts.total) } : undefined} />
              <StatTile icon="eye" label={t('admin.dash.rejected')} value={d ? groupThousands(d.posts.rejected) : '—'} delta={d ? { kind: 'flat', text: pct(d.posts.rejected, d.posts.total) } : undefined} />
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-overline text-text-secondary">{t('admin.dash.people')}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile icon="eye" label={t('admin.dash.totalUsers')} value={d ? groupThousands(d.users.total) : '—'} delta={d ? { kind: 'up', text: t('analytics.newCount', { count: d.users.new_7d }) } : undefined} />
              <StatTile icon="eye" label={t('admin.people.providers')} value={d ? groupThousands(d.users.providers) : '—'} delta={d ? { kind: 'flat', text: pct(d.users.providers, d.users.total) } : undefined} />
              <StatTile icon="eye" label={t('admin.people.customers')} value={d ? groupThousands(d.users.customers) : '—'} delta={d ? { kind: 'flat', text: pct(d.users.customers, d.users.total) } : undefined} />
            </div>
          </section>
          <Panel title={t('analytics.byCategory')}>
            {d ? <CategoryBars rows={d.by_category} /> : <div className="zm-pulse h-40 rounded-md bg-bg-surface-sunken" />}
          </Panel>
        </div>
        <Broadcast />
      </div>
    </div>
  );
}
