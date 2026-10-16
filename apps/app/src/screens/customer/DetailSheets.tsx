import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, countDays, formatPrice, priceForDays, replyTimeKey, type Booking, type BusyRange, type Listing, type ListingListItem } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { api, ApiError, errorText } from '../../lib/api';
import { fromYmd, shortRange, toYmd } from '../../lib/dates';
import { DEAL_KEYS, displayName } from '../../lib/deal';
import { usePushAsk } from '../../lib/push';
import { useAvailability } from '../../lib/queries';
import { track } from '../../lib/track';
import type { Nav } from '../../nav';
import { BottomSheet } from '../../ui/BottomSheet';
import { PushPromptCard } from '../../ui/PushPromptCard';
import { DateRangeCalendar, type DateRange } from '../../ui/DateRangeCalendar';
import { Icon } from '../../ui/Icon';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

const WEB_URL: string = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://zuuchmap.com';

const useStyles = themedStyles((t) => ({
  body: { ...t.type.body, color: t.colors.textSecondary },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  rowText: { ...t.type.bodyBold, color: t.colors.textPrimary, flex: 1 },
  summary: { padding: 14, borderRadius: t.radius.lg, backgroundColor: t.colors.bgSurfaceSunken, gap: 2 },
  summaryText: { ...t.type.labelStrong, color: t.colors.textPrimary },
  note: { ...t.type.small, color: t.colors.textSecondary },
  two: { flexDirection: 'row', gap: 12 },
  disc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: t.colors.statusSuccessTint },
  center: { ...t.type.caption, color: t.colors.textSecondary, textAlign: 'center' },
  h: { ...t.type.h3, color: t.colors.textPrimary, textAlign: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  k: { ...t.type.caption, color: t.colors.textSecondary },
  v: { ...t.type.labelStrong, color: t.colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  next: { ...t.type.labelStrong, color: t.colors.textPrimary },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bgSurfaceSunken },
  stepNumText: { ...t.type.badge, color: t.colors.textPrimary },
  stepText: { ...t.type.caption, color: t.colors.textPrimary, flex: 1 },
}));

// ---- B7: share ----

export function ShareSheet({ visible, onClose, listing }: { visible: boolean; onClose: () => void; listing: Pick<Listing, 'id' | 'title'> }) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const url = `${WEB_URL}/posts/${listing.id}`;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('customer.share.title')}>
      <Text style={s.body}>{t('customer.share.body')}</Text>
      <Pressable
        accessibilityRole="button"
        style={s.row}
        onPress={async () => {
          await Clipboard.setStringAsync(url);
          onClose();
          toast.show({ message: t('customer.share.copied'), kind: 'success' });
        }}
      >
        <Icon name="copy" size={22} color={colors.iconPrimary} />
        <Text style={s.rowText}>{t('customer.share.copyLink')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={s.row}
        onPress={() => {
          onClose();
          setTimeout(() => void Share.share({ message: `${listing.title ?? ''} ${url}`.trim(), url }).catch(() => undefined), 250);
        }}
      >
        <Icon name="share-2" size={22} color={colors.iconPrimary} />
        <Text style={s.rowText}>{t('customer.share.other')}</Text>
      </Pressable>
    </BottomSheet>
  );
}

/** Day-by-day predicate over the engine's busy ranges (and the 14-day list the listing already carries). */
export function useIsBooked(busy: BusyRange[] | undefined, busyDates: string[] | undefined) {
  return useMemo(() => {
    const set = new Set(busyDates ?? []);
    return (d: Date) => {
      const k = toYmd(d);
      if (set.has(k)) return true;
      return !!busy?.some((r) => k >= r.start_date.slice(0, 10) && k <= r.end_date.slice(0, 10));
    };
  }, [busy, busyDates]);
}

// ---- Availability calendar ----

export function AvailabilitySheet({ visible, onClose, isBooked }: { visible: boolean; onClose: () => void; isBooked: (d: Date) => boolean }) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('customer.detail.calendar')}>
      <DateRangeCalendar value={{ start: null, end: null }} onChange={() => undefined} isBooked={isBooked} />
    </BottomSheet>
  );
}

// ---- B3: booking, B4: booking sent ----

/** `HH:MM` as the engine takes it, from whatever digits were typed. */
const clock = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};
const validClock = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function BookingSheet({
  visible, onClose, listing, initial, onNeedsAuth,
}: {
  visible: boolean;
  onClose: () => void;
  /** Only what the request needs, so a past booking's listing can be booked again. */
  listing: ListingListItem | Listing;
  /** The dates the search already carried. */
  initial?: { from?: string; to?: string };
  onNeedsAuth: () => void;
}) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const toast = useToast();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const avail = useAvailability(listing.id, visible);
  const isBooked = useIsBooked(avail.data?.busy, listing.busy_dates);
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  const [address, setAddress] = useState('');
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Booking | null>(null);
  const ask = usePushAsk();
  useEffect(() => {
    if (visible) {
      setRange({ start: initial?.from ? fromYmd(initial.from) : null, end: initial?.to ? fromYmd(initial.to) : null });
      setAddress('');
      setTime('');
      setMessage('');
      setSent(null);
    }
  }, [visible, initial?.from, initial?.to]);

  const from = range.start ? toYmd(range.start) : undefined;
  const to = range.end ? toYmd(range.end) : undefined;
  const complete = !!from && !!to;
  const days = countDays(from, to);
  const total = complete ? priceForDays(listing.price_amount, listing.price_unit, days) : null;
  const timeBad = time !== '' && !validClock(time);
  const provider = listing.user;
  const providerName = displayName(provider, t('common.user'));

  const submit = async () => {
    if (!complete || timeBad) return;
    setBusy(true);
    track(ANALYTICS_EVENTS.CONTACT_BOOKING, { post_id: listing.id });
    try {
      const b = await api<Booking>('/bookings', {
        method: 'POST',
        body: { post_id: listing.id, start_date: from, end_date: to, message: message.trim() || undefined, address: address.trim() || undefined, start_time: time || undefined },
      });
      for (const k of DEAL_KEYS) void qc.invalidateQueries({ queryKey: [k] });
      setSent(b);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onClose();
        onNeedsAuth();
      } else toast.show({ message: errorText(e), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    const mins = provider?.reply_minutes;
    const rt = typeof mins === 'number' ? replyTimeKey(mins) : null;
    const steps = [t('deal.sent.step1'), t('deal.sent.step2'), t('deal.sent.step3')];
    return (
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title={t('deal.sheet.title')}
        footerLabel={t('deal.sent.view')}
        onFooter={() => {
          onClose();
          nav.navigate('MyBookings');
        }}
      >
        <View style={s.disc}><Icon name="circle-check" size={40} color={colors.statusSuccess} /></View>
        <Text style={s.h} accessibilityRole="header">{t('deal.sent.title')}</Text>
        <Text style={s.center}>{rt ? t('deal.sent.body', { name: providerName, time: t(rt.key, { count: rt.count }) }) : t('deal.sent.bodyNoTime')}</Text>
        <View style={s.summary}>
          <View style={s.kv}>
            <Text style={s.k}>{t('deal.sent.dates')}</Text>
            <Text style={s.v}>{`${shortRange(sent.start_date.slice(0, 10), sent.end_date.slice(0, 10), locale)} · ${t('ui.days', { days: sent.days })}`}</Text>
          </View>
          {sent.total !== null ? (
            <View style={s.kv}>
              <Text style={s.k}>{t('deal.sent.total')}</Text>
              <Text style={s.v}>{formatPrice(sent.total, 'TOTAL', locale) ?? ''}</Text>
            </View>
          ) : null}
        </View>
        <Text style={s.next}>{t('deal.sent.next')}</Text>
        {steps.map((text, i) => (
          <View key={text} style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{String(i + 1)}</Text></View>
            <Text style={s.stepText}>{text}</Text>
          </View>
        ))}
        {ask.show ? <PushPromptCard title={t('deal.sent.notifyTitle')} body={t('deal.sent.notifyBody', { name: providerName })} enableLabel={t('deal.sent.notifyOn')} onEnable={ask.enable} onLater={ask.later} /> : null}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('deal.sheet.title')} footerLabel={t('booking.submit')} footerDisabled={!complete || timeBad || busy} onFooter={() => void submit()}>
      {/* The calendar carries the pick hint and the striped-days legend itself. */}
      <DateRangeCalendar value={range} onChange={setRange} isBooked={isBooked} />
      {complete ? (
        <View style={s.summary}>
          <Text style={s.summaryText}>{`${shortRange(from, to, locale)} · ${t('ui.days', { days })}`}</Text>
          {total !== null ? <Text style={s.summaryText}>{formatPrice(total, 'TOTAL', locale) ?? ''}</Text> : null}
        </View>
      ) : null}
      <TextField label={t('deal.sheet.address')} value={address} onChangeText={setAddress} placeholder={t('deal.sheet.addressPlaceholder')} />
      <TextField label={t('deal.sheet.startTime')} value={time} onChangeText={(v) => setTime(clock(v))} placeholder="08:00" inputMode="numeric" keyboardType="number-pad" error={timeBad ? t('ui.invalid') : null} />
      <TextField label={t('deal.sheet.message')} value={message} onChangeText={setMessage} placeholder={t('booking.messagePlaceholder')} multiline maxLength={500} />
      <Text style={s.note}>{t('deal.sheet.note')}</Text>
    </BottomSheet>
  );
}
