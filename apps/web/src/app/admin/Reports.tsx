import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReportGroup } from '@zuuchmap/core';
import { errorKey } from '@/lib/api';
import { useReports, useResolveReport } from '@/lib/admin';
import { useDocTitle } from '@/lib/meta';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { AdminHead } from './Frame';

const ownerName = (g: ReportGroup): string =>
  g.owner?.company?.name ?? ([g.owner?.parent_name, g.owner?.given_name].filter(Boolean).join(' ') || g.owner?.phone_number || '');

/** Figma J4d: one card per reported subject, its reasons and reporters, keep or take down. */
function Card({ g }: { g: ReportGroup }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const resolve = useResolveReport();
  const post = g.kind === 'POST';
  const act = (action: 'KEEP' | 'TAKE_DOWN') => resolve.mutate({ id: g.id, action }, {
    onSuccess: () => toast.success(t(action === 'KEEP' ? 'report.resolvedKeep' : 'report.resolvedTaken')),
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const title = post ? g.post?.title ?? g.subject : g.subject;
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-sm px-1.5 py-0.5 text-badge', post ? 'bg-status-info-tint text-status-info' : 'bg-status-warning-tint text-status-warning')}>
          {post ? t('report.kindPost') : t('report.kindReview')}
        </span>
        {g.reasons.map((r) => <span key={r} className="rounded-sm bg-status-danger-tint px-1.5 py-0.5 text-badge text-status-danger">{t(`report.reasons.${r}`)}</span>)}
        <span className="ml-auto inline-flex items-center gap-1 text-small text-text-secondary"><Icon name="users" size={14} />{t('report.reporters', { count: g.reporters })}</span>
      </div>
      <div>
        {post && g.post_id && g.post ? (
          <Link to={`/posts/${String(g.post_id)}`} className="text-label-strong text-text-link hover:underline">{title}</Link>
        ) : (
          <p className="text-label-strong text-text-primary">{title ?? t('report.subjectGone')}</p>
        )}
        <p className="text-small text-text-secondary">{[ownerName(g), f.date(g.first_at)].filter(Boolean).join(' · ')}</p>
      </div>
      {g.detail && <p className="rounded-md bg-bg-surface-sunken px-3 py-2 text-body text-text-secondary">“{g.detail}”</p>}
      {g.status === 'OPEN' ? (
        <div className="flex gap-2">
          <Button variant="outline" size="medium" disabled={resolve.isPending} onClick={() => act('KEEP')}>{t('report.keep')}</Button>
          <Button variant="danger" size="medium" disabled={resolve.isPending} onClick={() => act('TAKE_DOWN')}>{post ? t('report.takeDownShort') : t('report.removeReview')}</Button>
        </div>
      ) : (
        <p className="text-small text-text-secondary">
          {t(`report.status.${g.status}`)}{g.resolved_at ? ` · ${f.date(g.resolved_at)}` : ''}{g.resolution ? ` · “${g.resolution}”` : ''}
        </p>
      )}
    </article>
  );
}

export default function Reports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const open = useReports('OPEN');
  const closed = useReports('CLOSED');
  const q = tab === 'OPEN' ? open : closed;
  useDocTitle(t('report.queue'));
  return (
    <div className="pb-10">
      <AdminHead title={t('report.queue')} />
      <div className="flex flex-col gap-4 px-4 md:px-8">
        <SegmentedControl
          label={t('report.queue')}
          value={tab}
          onChange={setTab}
          segments={[{ value: 'OPEN', label: t('report.openCount', { count: open.data?.total ?? 0 }) }, { value: 'CLOSED', label: t('report.status.RESOLVED') }]}
          className="md:max-w-[420px]"
        />
        {q.data?.items.length === 0 ? (
          <EmptyState icon="flag" title={t('report.queueEmpty')} className="py-16" />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">{(q.data?.items ?? []).map((g) => <Card key={g.id} g={g} />)}</div>
        )}
      </div>
    </div>
  );
}
