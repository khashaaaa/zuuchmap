import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, countDays, priceForDays, replyTimeKey, type Booking, type BookingCreateRequest, type Listing } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { displayName } from '@/lib/deals';
import { useBusyDays } from '@/lib/queries';
import { askForPush } from '@/lib/push';
import { shortDay } from '@/lib/search';
import { useToast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useFormat } from '@/lib/useFormat';
import { BottomSheet, SheetPresence } from '@/ui/BottomSheet';
import { DateRangeCalendar, type DateRange } from '@/ui/DateRangeCalendar';
import { Icon } from '@/ui/Icon';
import { TextArea } from '@/ui/TextArea';
import { TextField } from '@/ui/TextField';

interface Props { open: boolean; onClose: () => void; listing: Listing; initial?: DateRange }

/** B4: the request went out; what happens next. */
function Sent({ onClose, listing, booking }: { onClose: () => void; listing: Listing; booking: Booking }) {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const name = displayName(listing.user);
  const minutes = listing.user?.reply_minutes;
  const reply = typeof minutes === 'number' ? replyTimeKey(minutes) : null;
  const time = reply ? t(reply.key, { count: reply.count }) : null;
  // Once the confirmation is closed, offer to push the provider's answer.
  const close = () => {
    onClose();
    void askForPush('booking', { name });
  };
  const total = booking.total !== null ? f.amount(booking.total) : null;
  return (
    <BottomSheet
      open
      onClose={close}
      title={t('deal.sent.title')}
      primary={{ label: t('deal.sent.view'), onClick: () => { close(); void nav('/bookings'); } }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-status-success-tint text-status-success"><Icon name="circle-check" size={32} /></span>
        <p className="text-body text-text-secondary">{time ? t('deal.sent.body', { name, time }) : t('deal.sent.bodyNoTime')}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-bg-surface-sunken px-4 py-3">
        <div><dt className="text-small text-text-secondary">{t('deal.sent.dates')}</dt><dd className="text-body-bold text-text-primary">{shortDay(booking.start_date)} – {shortDay(booking.end_date)}</dd></div>
        {total && <div><dt className="text-small text-text-secondary">{t('deal.sent.total')}</dt><dd className="text-body-bold text-text-primary">{total}</dd></div>}
      </dl>
      <h3 className="pt-1 text-label-strong text-text-primary">{t('deal.sent.next')}</h3>
      <ol className="flex flex-col gap-2.5">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex items-center gap-3 text-body text-text-primary">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-bg-surface-sunken text-label-strong">{n}</span>
            {t(`deal.sent.step${n}`)}
          </li>
        ))}
      </ol>
    </BottomSheet>
  );
}

function Body({ onClose, listing, initial }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const qc = useQueryClient();
  const booked = useBusyDays(listing, true);
  const [range, setRange] = useState<DateRange>(initial ?? {});
  const [address, setAddress] = useState('');
  const [startTime, setStartTime] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<Booking | null>(null);
  const end = range.end ?? range.start;
  const days = countDays(range.start, end);
  const sum = priceForDays(listing.price_amount, listing.price_unit, days);

  const book = useMutation({
    mutationFn: () => {
      const body: BookingCreateRequest = { post_id: listing.id, start_date: range.start ?? '', end_date: end ?? '' };
      if (address.trim()) body.address = address.trim();
      if (startTime) body.start_time = startTime;
      if (message.trim()) body.message = message.trim();
      return api<Booking>('/bookings', { method: 'POST', body });
    },
    onSuccess: (b) => {
      track(ANALYTICS_EVENTS.CONTACT_BOOKING, { id: listing.id });
      for (const key of ['availability', 'bookings', 'conversations', 'listing']) void qc.invalidateQueries({ queryKey: [key] });
      setSent(b);
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (sent) return <Sent onClose={onClose} listing={listing} booking={sent} />;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('deal.sheet.title')}
      primary={{ label: t('booking.submit'), disabled: !range.start || book.isPending, onClick: () => book.mutate() }}
    >
      <p className="text-caption text-text-secondary">{t('deal.sheet.hint')}</p>
      <DateRangeCalendar value={range} onChange={setRange} booked={booked} />
      {range.start && end && (
        <div className="flex items-center justify-between rounded-md bg-bg-surface-sunken px-4 py-3">
          <span className="text-body text-text-primary">{shortDay(range.start)} – {shortDay(end)}</span>
          <span className="text-body-bold text-text-primary">{sum !== null ? t('customer.browse.daysTotal', { days, total: f.amount(sum) ?? '' }) : ''}</span>
        </div>
      )}
      <TextField label={t('deal.sheet.address')} placeholder={t('deal.sheet.addressPlaceholder')} icon="map-pin" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
      <TextField label={t('deal.sheet.startTime')} type="time" icon="clock" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      <TextArea label={t('deal.sheet.message')} placeholder={t('booking.messagePlaceholder')} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
      <p className="text-small text-text-secondary">{t('deal.sheet.note')}</p>
    </BottomSheet>
  );
}

/** B3 and B4: pick the days (and optionally where, when, a note), send `POST /bookings`, then say what happens next. */
export function BookingSheet({ open, ...rest }: Props) {
  return <SheetPresence open={open}><Body {...rest} /></SheetPresence>;
}
