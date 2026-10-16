import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Booking, ReceivedBookingsTab } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { displayName, useReceivedBookings, useRefreshDeals } from '@/lib/deals';
import { useDocTitle } from '@/lib/meta';
import { useOnline } from '@/lib/queries';
import { shortDay } from '@/lib/search';
import { useToast } from '@/lib/toast';
import { AppHeader } from '@/ui/AppHeader';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Modal } from '@/ui/Modal';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { TextArea } from '@/ui/TextArea';
import { BookingItem } from './BookingItem';
import { NeedSignIn } from './NeedSignIn';

const range = (b: Booking) => `${shortDay(b.start_date)} – ${shortDay(b.end_date)}`;

/** E3–E15: requests on the provider's listings. */
export default function BookingRequests() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const refresh = useRefreshDeals();
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<ReceivedBookingsTab>('new');
  const [declining, setDeclining] = useState<Booking | null>(null);
  const [reply, setReply] = useState('');
  const q = useReceivedBookings(tab);
  useDocTitle(t('deal.received.title'));

  const answer = useMutation({
    mutationFn: ({ b, action, text }: { b: Booking; action: 'accept' | 'decline'; text?: string }) =>
      api(`/bookings/${b.id}/${action}`, { method: 'PUT', body: text ? { response_message: text } : {} }),
    onSuccess: (_, v) => {
      setDeclining(null);
      setReply('');
      refresh();
      toast.success(t(`deal.status.${v.action === 'accept' ? 'ACCEPTED' : 'DECLINED'}`));
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const counts = q.data?.counts;
  const label = (k: ReceivedBookingsTab) => (counts ? t('deal.tabCount', { label: t(`deal.received.${k}`), count: counts[k] }) : t(`deal.received.${k}`));
  const items = q.data?.items ?? [];
  const byId = new Map(items.map((b) => [b.id, b]));
  const closeDecline = () => {
    setDeclining(null);
    setReply('');
  };

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <AppHeader variant="pushed" title={t('deal.received.title')} onBack={() => void nav(-1)} className="md:hidden" />
      <h1 className="hidden px-6 pt-8 text-h1 text-text-primary md:block">{t('deal.received.title')}</h1>
      {!token ? (
        <NeedSignIn />
      ) : (
        <div className="flex flex-col gap-4 px-4 pb-10 pt-3 md:px-6">
          <SegmentedControl
            label={t('deal.received.title')}
            value={tab}
            onChange={setTab}
            segments={(['new', 'accepted', 'past'] as const).map((k) => ({ value: k, label: label(k) }))}
          />
          <Button size="medium" variant="outline" icon="calendar" onClick={() => void nav('/provider/block')} className="self-start">{t('deal.received.blockDays')}</Button>
          {q.isPending ? (
            <>{Array.from({ length: 3 }, (_, i) => <SkeletonListingRow key={i} />)}</>
          ) : q.isError ? (
            <EmptyState icon={online ? 'refresh-cw' : 'wifi-off'} title={t('deal.mine.errorTitle')} body={t('deal.mine.errorBody')} action={{ label: t('deal.retry'), onClick: () => void q.refetch() }} />
          ) : items.length === 0 ? (
            <EmptyState icon="inbox" title={t('deal.received.emptyTitle')} body={t('deal.received.emptyBody')} />
          ) : (
            items.map((b) => {
              const clash = b.conflicts.map((id) => byId.get(id)).filter((x): x is Booking => !!x);
              return (
                <BookingItem key={b.id} booking={b}>
                  {b.status === 'PENDING' && b.conflicts.length > 0 && (
                    <Banner tone="warning" title={t('deal.received.overlap', { dates: range(b), name: clash.length ? clash.map((c) => displayName(c.customer)).join(', ') : `#${b.conflicts.join(', #')}` })} />
                  )}
                  {b.response_message && <p className="text-caption text-text-secondary">{b.response_message}</p>}
                  {b.status === 'PENDING' && (
                    <div className="flex gap-3">
                      <Button size="medium" className="flex-1" disabled={answer.isPending} onClick={() => answer.mutate({ b, action: 'accept' })}>{t('deal.received.accept')}</Button>
                      <Button size="medium" variant="outline" className="flex-1" disabled={answer.isPending} onClick={() => setDeclining(b)}>{t('deal.received.decline')}</Button>
                    </div>
                  )}
                </BookingItem>
              );
            })
          )}
        </div>
      )}
      <Modal
        open={!!declining}
        onClose={closeDecline}
        tone="danger"
        destructive
        title={t('deal.received.declineTitle')}
        body={declining ? t('deal.received.declineBody', { name: displayName(declining.customer), dates: range(declining) }) : undefined}
        cancelLabel={t('deal.received.keep')}
        confirmLabel={t('deal.received.decline')}
        onConfirm={() => declining && answer.mutate({ b: declining, action: 'decline', text: reply.trim() })}
      >
        <TextArea label={t('booking.responseMessage')} placeholder={t('deal.received.responsePlaceholder')} value={reply} maxLength={500} onChange={(e) => setReply(e.target.value)} />
      </Modal>
    </div>
  );
}
