import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Booking, MyBookingsTab } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { displayName, useMyBookings, useRefreshDeals } from '@/lib/deals';
import { useDocTitle } from '@/lib/meta';
import { useOnline } from '@/lib/queries';
import { shortDay } from '@/lib/search';
import { useToast } from '@/lib/toast';
import { AppHeader } from '@/ui/AppHeader';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { BookingItem } from './BookingItem';
import { NeedSignIn } from './NeedSignIn';
import { ReviewSheet } from './sheets/ReviewSheet';

const CLOSED = new Set(['DECLINED', 'CANCELLED', 'EXPIRED']);

function Actions({ b, onCancel, onRate }: { b: Booking; onCancel: () => void; onRate: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const similar = () => {
    const p = new URLSearchParams({ category: b.category });
    if (b.post?.subcategory) p.set('subcategory', b.post.subcategory);
    void nav(`/browse?${p.toString()}`);
  };
  const again = b.post_id ? <Button size="medium" variant="outline" onClick={() => void nav(`/posts/${b.post_id}?book=1`)}>{t('deal.mine.bookAgain')}</Button> : null;
  if (b.status === 'PENDING') {
    return (
      <div className="flex items-center gap-3">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-caption text-text-secondary"><Icon name="clock" size={16} />{t('deal.mine.waiting')}</p>
        <Button size="medium" variant="outline" onClick={onCancel}>{t('deal.mine.cancel')}</Button>
      </div>
    );
  }
  if (b.status === 'ACCEPTED') {
    const before = new Date().toISOString().slice(0, 10) < b.start_date;
    return (
      <div className="flex flex-wrap items-center gap-3">
        {b.can_review && <Button size="medium" icon="star" onClick={onRate}>{t('deal.mine.rate')}</Button>}
        {b.can_review && <span className="text-caption text-text-secondary">{t('deal.mine.reviewDue')}</span>}
        {!b.can_review && before && <Button size="medium" variant="outline" onClick={onCancel}>{t('deal.mine.cancel')}</Button>}
        {!before && again}
      </div>
    );
  }
  if (CLOSED.has(b.status)) {
    return (
      <div className="flex flex-wrap gap-3">
        {again}
        <Button size="medium" variant="outline" onClick={similar}>{t('deal.mine.findSimilar')}</Button>
      </div>
    );
  }
  return null;
}

/** U1–U5: the customer's booking requests, active and past. */
export default function MyBookings() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const refresh = useRefreshDeals();
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<MyBookingsTab>('active');
  const [cancel, setCancel] = useState<Booking | null>(null);
  const [rate, setRate] = useState<Booking | null>(null);
  const q = useMyBookings(tab);
  useDocTitle(t('deal.mine.title'));

  const doCancel = useMutation({
    mutationFn: (b: Booking) => api(`/bookings/${b.id}/cancel`, { method: 'PUT' }),
    onSuccess: () => {
      setCancel(null);
      refresh();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const counts = q.data?.counts;
  const label = (k: MyBookingsTab) => (counts ? t('deal.tabCount', { label: t(`deal.mine.${k}`), count: counts[k] }) : t(`deal.mine.${k}`));
  const items = q.data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <AppHeader variant="pushed" title={t('deal.mine.title')} onBack={() => void nav(-1)} className="md:hidden" />
      <h1 className="hidden px-6 pt-8 text-h1 text-text-primary md:block">{t('deal.mine.title')}</h1>
      {!token ? (
        <NeedSignIn />
      ) : (
        <div className="flex flex-col gap-4 px-4 pb-10 pt-3 md:px-6">
          <SegmentedControl
            label={t('deal.mine.title')}
            value={tab}
            onChange={setTab}
            segments={[{ value: 'active', label: label('active') }, { value: 'past', label: label('past') }]}
          />
          {q.isPending ? (
            <>{Array.from({ length: 3 }, (_, i) => <SkeletonListingRow key={i} />)}</>
          ) : q.isError ? (
            <EmptyState icon={online ? 'refresh-cw' : 'wifi-off'} title={t('deal.mine.errorTitle')} body={t('deal.mine.errorBody')} action={{ label: t('deal.retry'), onClick: () => void q.refetch() }} />
          ) : items.length === 0 ? (
            <EmptyState icon="calendar" title={t('deal.mine.emptyTitle')} body={t('deal.mine.emptyBody')} action={{ label: t('deal.mine.emptyAction'), onClick: () => void nav('/browse') }} />
          ) : (
            items.map((b) => (
              <BookingItem key={b.id} booking={b}>
                <Actions b={b} onCancel={() => setCancel(b)} onRate={() => setRate(b)} />
              </BookingItem>
            ))
          )}
        </div>
      )}
      <Modal
        open={!!cancel}
        onClose={() => setCancel(null)}
        tone="danger"
        destructive
        title={t('deal.mine.cancelTitle')}
        body={cancel ? t('deal.mine.cancelBody', { listing: cancel.post_title ?? '', dates: `${shortDay(cancel.start_date)} – ${shortDay(cancel.end_date)}`, name: displayName(cancel.provider) }) : undefined}
        cancelLabel={t('deal.mine.keep')}
        confirmLabel={t('deal.mine.cancel')}
        onConfirm={() => cancel && doCancel.mutate(cancel)}
      />
      {rate && (
        <ReviewSheet
          open
          onClose={() => setRate(null)}
          providerId={rate.provider.id}
          context={t('deal.review.finished', { listing: rate.post_title ?? '', dates: `${shortDay(rate.start_date)} – ${shortDay(rate.end_date)}` })}
        />
      )}
    </div>
  );
}
