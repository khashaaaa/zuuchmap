import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { bookingValue } from '@zuuchmap/core';
import { displayName } from '@/lib/deals';
import { useDocTitle } from '@/lib/meta';
import { useBookingValue } from '@/lib/provider';
import { useFormat } from '@/lib/useFormat';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { PageHead, ProviderOnly } from './Page';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function Value() {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const month = monthKey(cursor);
  const thisMonth = month === monthKey(new Date());
  const q = useBookingValue(month);
  useDocTitle(t('prov.value.title'));
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div className="pb-10">
      <PageHead title={t('prov.value.title')} back />
      <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 pt-2 md:mx-0 md:px-8 md:pt-6">
        <div className="flex items-center">
          <IconButton icon="chevron-left" label={t('kit.calendar.prev')} variant="ghost" size="medium" onClick={() => shift(-1)} />
          <p aria-live="polite" className="flex-1 text-center text-title text-text-primary">{t('prov.value.month', { year: cursor.getFullYear(), month: cursor.getMonth() + 1 })}</p>
          <IconButton icon="chevron-right" label={t('kit.calendar.next')} variant="ghost" size="medium" disabled={thisMonth} onClick={() => shift(1)} />
        </div>
        {q.isError ? (
          <EmptyState icon="refresh-cw" title={t('customer.browse.loadFailed')} action={{ label: t('common.retry'), onClick: () => void q.refetch() }} />
        ) : !q.data ? (
          <div className="zm-pulse h-[120px] rounded-xl bg-bg-surface-sunken" aria-hidden="true" />
        ) : (
          <>
            <div className="flex flex-col gap-1 rounded-xl border border-border-subtle bg-bg-surface p-5">
              <p className="text-h1 tabular-nums text-text-primary">{f.amount(q.data.total) ?? '0₮'}</p>
              <p className="text-small text-status-success">{t('prov.home.confirmed', { count: q.data.count })}</p>
            </div>
            <p className="text-caption text-text-secondary">{t('prov.value.note')}</p>
            {q.data.items.length === 0 ? (
              <EmptyState icon="calendar" title={t('prov.value.empty')} className="rounded-xl border border-border-subtle bg-bg-surface" />
            ) : (
              <ul className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
                {q.data.items.map((b) => {
                  const amount = bookingValue(b);
                  return (
                    <li key={b.id} className="border-b border-border-subtle last:border-b-0">
                      <button type="button" onClick={() => void nav('/requests')} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:shadow-focus">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-body-bold text-text-primary">{b.post_title ?? ''}</span>
                          <span className="truncate text-caption text-text-secondary">{`${displayName(b.customer)} · ${f.date(b.start_date)} – ${f.date(b.end_date)}`}</span>
                        </span>
                        <span className="text-label-strong tabular-nums text-text-primary">{f.amount(amount)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function BookingValue() {
  return <ProviderOnly><Value /></ProviderOnly>;
}
