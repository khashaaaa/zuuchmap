import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { groupThousands } from '@zuuchmap/core';
import { useAnalytics, waited } from '@/lib/admin';
import { useDocTitle } from '@/lib/meta';
import { usePlace } from '@/lib/labels';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { StatTile } from '@/ui/StatTile';
import { CategoryBars } from './Dashboard';
import { AdminHead, Panel } from './Frame';

const DAYS = ['7', '30', '90'] as const;

/** Figma J7d: users, live listings, the queue, accepted bookings; the funnel; categories; search gaps. */
export default function Analytics() {
  const { t } = useTranslation();
  const place = usePlace();
  const [days, setDays] = useState<(typeof DAYS)[number]>('7');
  const q = useAnalytics(Number(days));
  const a = q.data;
  useDocTitle(t('analytics.title'));
  const change = a && a.bookings_accepted.previous > 0
    ? Math.round(((a.bookings_accepted.count - a.bookings_accepted.previous) / a.bookings_accepted.previous) * 100)
    : null;
  const wait = a?.pending.oldest_at ? waited(a.pending.oldest_at) : null;
  const steps = a ? [
    { label: t('analytics.views'), n: a.funnel.viewed },
    { label: t('analytics.contacted'), n: a.funnel.contacted },
    { label: t('analytics.requested'), n: a.funnel.requested },
    { label: t('analytics.accepted'), n: a.funnel.accepted },
  ] : [];
  const top = Math.max(1, ...steps.map((s) => s.n));
  return (
    <div className="pb-10">
      <AdminHead
        title={t('analytics.title')}
        actions={<SegmentedControl label={t('analytics.title')} value={days} onChange={setDays} segments={DAYS.map((d) => ({ value: d, label: t('analytics.days', { count: Number(d) }) }))} />}
      />
      <div className="flex flex-col gap-5 px-4 md:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="users" label={t('analytics.users')} value={a ? groupThousands(a.users.total) : '—'} delta={a ? { kind: 'up', text: t('analytics.newCount', { count: a.users.new }) } : undefined} />
          <StatTile icon="eye" label={t('analytics.liveListings')} value={a ? groupThousands(a.live.total) : '—'} delta={a ? { kind: 'up', text: t('analytics.newCount', { count: a.live.new }) } : undefined} />
          <StatTile icon="clock" label={t('analytics.pendingQueue')} value={a ? groupThousands(a.pending.count) : '—'} delta={wait ? { kind: 'flat', text: t('analytics.oldestWait', { time: t(`admin.queue.${wait.unit}`, { count: wait.count }) }) } : undefined} />
          <StatTile icon="calendar" label={t('analytics.acceptedBookings')} value={a ? groupThousands(a.bookings_accepted.count) : '—'} delta={change !== null ? { kind: change >= 0 ? 'up' : 'flat', text: t('analytics.vsPrevious', { pct: `${change >= 0 ? '+' : ''}${String(change)}` }) } : undefined} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title={t('analytics.funnelTitle')} hint={t('analytics.funnelHint')}>
            <ul className="flex flex-col gap-3">
              {steps.map((s) => (
                <li key={s.label} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_64px] items-center gap-3">
                  <span className="truncate text-label text-text-primary">{s.label}</span>
                  <span className="h-2 overflow-hidden rounded-pill bg-bg-surface-sunken"><span className="block h-full rounded-pill bg-action-primary" style={{ width: `${String((s.n / top) * 100)}%` }} /></span>
                  <span className="text-right text-label-strong tabular-nums text-text-primary">{groupThousands(s.n)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t('analytics.byCategory')} hint={t('analytics.byCategoryHint')}>
            {a ? <CategoryBars rows={a.by_category.slice(0, 8)} /> : null}
          </Panel>
        </div>
        <Panel title={t('analytics.searchGaps')} hint={t('analytics.searchGapsHint')}>
          {a && a.search_gaps.length === 0 ? (
            <p className="text-caption text-text-secondary">{t('analytics.noData')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {(a?.search_gaps ?? []).map((g) => (
                <li key={`${g.query}:${g.province ?? ''}`} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label-strong text-text-primary">{g.query}</span>
                    <span className="text-small text-text-secondary">{t('analytics.gapCount', { count: g.count })}</span>
                  </span>
                  {g.province && <span className="shrink-0 text-small text-text-secondary">{place(g.province, null)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
