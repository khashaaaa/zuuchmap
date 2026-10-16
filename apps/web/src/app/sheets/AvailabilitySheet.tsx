import { useTranslation } from 'react-i18next';
import type { Listing } from '@zuuchmap/core';
import { BottomSheet, SheetPresence } from '@/ui/BottomSheet';
import { DateRangeCalendar } from '@/ui/DateRangeCalendar';
import { useBusyDays } from '@/lib/queries';

function Body({ onClose, listing }: { onClose: () => void; listing: Listing }) {
  const { t } = useTranslation();
  const booked = useBusyDays(listing, true);
  return (
    <BottomSheet open onClose={onClose} title={t('customer.detail.calendar')}>
      <DateRangeCalendar value={{}} onChange={() => undefined} booked={booked} />
    </BottomSheet>
  );
}

/** The listing's calendar, read-only ("Хуанли" on the availability line). */
export function AvailabilitySheet({ open, ...rest }: { open: boolean; onClose: () => void; listing: Listing }) {
  return <SheetPresence open={open}><Body {...rest} /></SheetPresence>;
}
