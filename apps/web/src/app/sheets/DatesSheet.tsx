import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDaysKey, todayKey } from '@/lib/search';
import { BottomSheet, SheetPresence } from '@/ui/BottomSheet';
import { Chip } from '@/ui/Chip';
import { DateRangeCalendar, type DateRange } from '@/ui/DateRangeCalendar';

interface Props {
  open: boolean;
  onClose: () => void;
  from?: string;
  to?: string;
  onApply: (from?: string, to?: string) => void;
}

function Body({ onClose, from, to, onApply }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange>({ start: from, end: to });
  const today = todayKey();
  const dow = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)).getDay();
  const sat = dow === 0 ? addDaysKey(today, -1) : addDaysKey(today, (6 - dow + 7) % 7);
  const quick: { key: string; start: string; end: string }[] = [
    { key: 'today', start: today, end: today },
    { key: 'tomorrow', start: addDaysKey(today, 1), end: addDaysKey(today, 1) },
    { key: 'weekend', start: sat < today ? today : sat, end: addDaysKey(sat, 1) },
    { key: 'week', start: today, end: addDaysKey(today, 6) },
  ];
  const ready = !!range.start;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('customer.dates.title')}
      secondary={{ label: t('common.clear'), onClick: () => { onApply(undefined, undefined); onClose(); } }}
      primary={{ label: t('common.apply'), disabled: !ready, onClick: () => { onApply(range.start, range.end ?? range.start); onClose(); } }}
    >
      <p className="text-label text-text-secondary">{t('customer.dates.quick')}</p>
      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <Chip key={q.key} label={t(`customer.dates.${q.key}`)} selected={range.start === q.start && range.end === q.end} onClick={() => setRange({ start: q.start, end: q.end })} />
        ))}
      </div>
      <DateRangeCalendar value={range} onChange={setRange} />
      <p className="text-small text-text-secondary">{t('kit.calendar.legendPick')}</p>
    </BottomSheet>
  );
}

/** A3. The calendar state is remounted per opening so it always starts from the applied dates. */
export function DatesSheet({ open, ...rest }: Props) {
  return <SheetPresence open={open}><Body {...rest} /></SheetPresence>;
}
