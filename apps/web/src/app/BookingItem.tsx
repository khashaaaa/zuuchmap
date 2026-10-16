import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Booking } from '@zuuchmap/core';
import { displayName, useBookingChat } from '@/lib/deals';
import { useCategoryLookup } from '@/lib/labels';
import { shortDay } from '@/lib/search';
import { useFormat } from '@/lib/useFormat';
import { Button } from '@/ui/Button';
import { BookingCard } from '@/ui/BookingCard';
import { Icon } from '@/ui/Icon';

/** One booking for either side: the summary, the address / start time / phone it carries, then the screen's own actions. */
export function BookingItem({ booking: b, children }: { booking: Booking; children?: ReactNode }) {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const cats = useCategoryLookup();
  const chat = useBookingChat();
  const mine = b.role === 'CUSTOMER';
  const other = mine ? b.provider : b.customer;
  const accepted = b.status === 'ACCEPTED';
  const statusKey = b.closed_reason === 'OVERLAP' ? 'OVERLAP' : b.status;
  const dates = t('deal.rangeDays', { range: `${shortDay(b.start_date)} – ${shortDay(b.end_date)}`, days: t('deal.days', { count: b.days }) });
  const directions = b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}` : null;
  const fact = 'flex items-center gap-2 text-caption text-text-secondary';

  return (
    <BookingCard
      title={b.post_title ?? b.post?.title ?? t('booking.postRemoved')}
      person={displayName(other)}
      photo={b.post?.images?.[0]}
      categoryKey={b.category}
      categoryIcon={cats.byKey.get(b.category)?.icon}
      status={b.status}
      statusLabel={t(`deal.status.${statusKey}`)}
      dates={dates}
      total={b.total !== null ? (f.amount(b.total) ?? undefined) : undefined}
      onOpen={b.post_id ? () => void nav(`/posts/${b.post_id}`) : undefined}
    >
      {(b.address || b.start_time || b.message) && (
        <div className="flex flex-col gap-1.5">
          {b.address && (
            <p className={fact}>
              <Icon name="map-pin" size={16} />
              <span className="min-w-0 flex-1">{b.address}</span>
              {directions && accepted && <a href={directions} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 shrink-0 items-center text-label-strong text-text-link">{t('customer.detail.directions')}</a>}
            </p>
          )}
          {b.start_time && accepted && b.role === 'CUSTOMER' ? (
            <p className={fact}><Icon name="clock" size={16} />{t('deal.mine.arrival', { date: shortDay(b.start_date), time: b.start_time })}</p>
          ) : (
            b.start_time && <p className={fact}><Icon name="clock" size={16} />{b.start_time}</p>
          )}
          {b.message && <p className={fact}><Icon name="message-circle" size={16} /><span className="min-w-0 flex-1 break-words">{b.message}</span></p>}
        </div>
      )}
      {accepted && b.contact_phone && (
        <div className="flex items-center gap-3">
          <span className="inline-flex flex-1 items-center gap-2 text-body-bold text-text-primary"><Icon name="phone" size={18} />{b.contact_phone}</span>
          <Button size="medium" variant="outline" icon="message-circle" onClick={() => chat(b)}>{t('messages.title')}</Button>
          <a href={`tel:${b.contact_phone}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-button bg-action-primary px-4 text-label-strong text-action-on-primary focus-visible:outline-none focus-visible:shadow-focus">
            <Icon name="phone" size={18} />{t('deal.received.call')}
          </a>
        </div>
      )}
      {children}
    </BookingCard>
  );
}
