import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatPrice, type Booking } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { shortDate, shortRange } from '../../lib/dates';
import { displayName } from '../../lib/deal';
import { recordCall } from '../../lib/track';
import { Button } from '../../ui/Button';
import { DealStatusChip } from '../../ui/DealStatusChip';
import { Icon } from '../../ui/Icon';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  card: { gap: 10, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { ...t.type.bodyBold, color: t.colors.textPrimary, flex: 1 },
  who: { ...t.type.caption, color: t.colors.textSecondary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { ...t.type.labelStrong, color: t.colors.textPrimary, flex: 1 },
  cap: { ...t.type.caption, color: t.colors.textSecondary, flex: 1 },
  total: { ...t.type.bodyBold, color: t.colors.textPrimary },
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: t.radius.lg },
  noteText: { ...t.type.small, flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { ...t.type.labelStrong, color: t.colors.textLink },
}));

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** True while the first day has not started: an ACCEPTED booking can still be cancelled. */
export const beforeFirstDay = (b: Booking): boolean => b.start_date.slice(0, 10) > todayYmd();

function mapUrl(b: Booking): string | null {
  const p = b.post;
  if (p && p.latitude !== null && p.longitude !== null) {
    const ll = `${p.latitude},${p.longitude}`;
    return Platform.OS === 'android' ? `geo:${ll}?q=${ll}` : `https://maps.apple.com/?ll=${ll}`;
  }
  if (b.address) return Platform.OS === 'android' ? `geo:0,0?q=${encodeURIComponent(b.address)}` : `https://maps.apple.com/?q=${encodeURIComponent(b.address)}`;
  return null;
}

export interface BookingCardProps {
  booking: Booking;
  /** Provider side: the other pending requests that share days, worded ("10.20 – 10.21 өдрүүд … давхцаж байна"). */
  overlaps?: string[];
  busy?: boolean;
  onOpenListing?: () => void;
  onChat?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onRate?: () => void;
  onBookAgain?: () => void;
  onFindSimilar?: () => void;
}

/** One booking, from either side: U1/U2 for the customer, E3/E7/E15 for the provider. */
export function BookingCard({ booking: b, overlaps, busy, onOpenListing, onChat, onAccept, onDecline, onCancel, onRate, onBookAgain, onFindSimilar }: BookingCardProps) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const provider = b.role === 'PROVIDER';
  const other = provider ? b.customer : b.provider;
  const from = b.start_date.slice(0, 10);
  const to = b.end_date.slice(0, 10);
  const total = b.total !== null ? formatPrice(b.total, 'TOTAL', locale) : null;
  const accepted = b.status === 'ACCEPTED';
  const gone = !b.post_id || !b.post;
  const url = mapUrl(b);
  const closed = b.status === 'DECLINED' || b.status === 'CANCELLED' || b.status === 'EXPIRED';

  return (
    <View style={s.card}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" disabled={gone || !onOpenListing} onPress={onOpenListing} style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={2}>{b.post_title ?? t('booking.postRemoved')}</Text>
          <Text style={s.who} numberOfLines={1}>{displayName(other)}</Text>
        </Pressable>
        <DealStatusChip status={b.status} closedReason={b.closed_reason} />
      </View>

      <View style={s.line}>
        <Icon name="calendar" size={18} color={colors.iconSecondary} />
        <Text style={s.lineText}>{t('deal.rangeDays', { range: shortRange(from, to, locale), days: t('deal.days', { count: b.days }) })}</Text>
        {total ? <Text style={s.total}>{total}</Text> : null}
      </View>

      {accepted && b.start_time ? (
        <View style={s.line}>
          <Icon name="clock" size={18} color={colors.iconSecondary} />
          <Text style={s.lineText}>{t('deal.mine.arrival', { date: shortDate(from, locale), time: b.start_time })}</Text>
        </View>
      ) : null}

      {b.address && (accepted || provider) ? (
        <View style={s.line}>
          <Icon name="map-pin" size={18} color={colors.iconSecondary} />
          <Text style={s.cap} numberOfLines={2}>{b.address}</Text>
          {url && accepted && !provider ? (
            <Pressable accessibilityRole="link" hitSlop={10} onPress={() => void Linking.openURL(url).catch(() => undefined)}>
              <Text style={s.link}>{t('customer.detail.directions')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {b.message && provider ? (
        <View style={s.line}>
          <Icon name="message-circle" size={18} color={colors.iconSecondary} />
          <Text style={s.cap} numberOfLines={3}>{b.message}</Text>
        </View>
      ) : null}

      {accepted && b.contact_phone ? (
        <View style={s.line}>
          <Icon name="phone" size={18} color={colors.iconSecondary} />
          <Text style={s.lineText}>{b.contact_phone}</Text>
        </View>
      ) : null}

      {b.response_message && !provider ? (
        <View style={[s.note, { backgroundColor: colors.bgSurfaceSunken }]}>
          <Icon name="message-circle" size={16} color={colors.iconSecondary} />
          <Text style={[s.noteText, { color: colors.textSecondary }]}>{b.response_message}</Text>
        </View>
      ) : null}

      {overlaps && b.status === 'PENDING' ? overlaps.map((o) => (
        <View key={o} style={[s.note, { backgroundColor: colors.statusWarningTint }]}>
          <Icon name="alert-triangle" size={16} color={colors.statusWarning} />
          <Text style={[s.noteText, { color: colors.textPrimary }]}>{o}</Text>
        </View>
      )) : null}

      {!provider && b.status === 'PENDING' ? <Text style={s.cap}>{t('deal.mine.waiting')}</Text> : null}

      <View style={s.actions}>
        {provider && b.status === 'PENDING' ? (
          <>
            <Button label={t('deal.received.accept')} size="medium" loading={busy} onPress={onAccept} />
            <Button label={t('deal.received.decline')} size="medium" variant="outline" disabled={busy} onPress={onDecline} />
          </>
        ) : null}
        {accepted && b.contact_phone ? (
          <>
            <Button label={t('messages.title')} size="medium" variant="secondary" icon="message-circle" onPress={onChat} />
            <Button label={t('deal.received.call')} size="medium" variant="outline" icon="phone" onPress={() => { if (b.post_id) recordCall(b.post_id); void Linking.openURL(`tel:${b.contact_phone}`).catch(() => undefined); }} />
          </>
        ) : null}
        {!provider && b.can_review ? <Button label={t('deal.mine.rate')} size="medium" icon="star" onPress={onRate} /> : null}
        {!provider && (b.status === 'PENDING' || (accepted && beforeFirstDay(b))) ? <Button label={t('deal.mine.cancel')} size="medium" variant="outline" disabled={busy} onPress={onCancel} /> : null}
        {!provider && !gone && (closed || b.can_review || (accepted && !beforeFirstDay(b))) ? <Button label={t('deal.mine.bookAgain')} size="medium" variant="outline" onPress={onBookAgain} /> : null}
        {!provider && closed ? <Button label={t('deal.mine.findSimilar')} size="medium" variant="outline" icon="search" onPress={onFindSimilar} /> : null}
      </View>
    </View>
  );
}
