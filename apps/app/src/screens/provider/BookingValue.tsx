import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { bookingValue, formatPrice } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { errorText } from '../../lib/api';
import { shortRange } from '../../lib/dates';
import { displayName } from '../../lib/deal';
import { month, useBookingValue } from '../../lib/provider';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 12, flexGrow: 1 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  month: { ...t.type.title, color: t.colors.textPrimary },
  hero: { gap: 4, padding: 20, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  big: { ...t.type.display, color: t.colors.textPrimary, fontVariant: ['tabular-nums'] },
  cap: { ...t.type.caption, color: t.colors.textSecondary },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noteText: { ...t.type.small, color: t.colors.textSecondary, flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  itemTitle: { ...t.type.bodyBold, color: t.colors.textPrimary },
}));

const shift = (m: string, n: number): string => {
  const [y, mo] = m.split('-').map(Number);
  return month(new Date(y, mo - 1 + n, 1));
};

/** E16: the month's accepted bookings and their value. Customers pay providers directly: booking value, never income. */
export function BookingValueScreen() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const [m, setM] = useState(month());
  const q = useBookingValue(m);
  const [y, mo] = m.split('-').map(Number);
  const items = q.data?.items ?? [];

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('prov.value.title')} onBack={() => nav.goBack()} />
      <View style={s.monthRow}>
        <IconButton icon="chevron-left" label={t('kit.calendar.prev')} variant="ghost" onPress={() => setM(shift(m, -1))} />
        <Text style={s.month}>{t('prov.value.month', { year: y, month: mo })}</Text>
        <IconButton icon="chevron-right" label={t('kit.calendar.next')} variant="ghost" disabled={m >= month()} onPress={() => setM(shift(m, 1))} />
      </View>
      {q.isLoading ? (
        <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : q.isError || !q.data ? (
        <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={errorText(q.error)} actionLabel={t('deal.retry')} onAction={() => void q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={s.content}
          ListHeaderComponent={
            <View style={{ gap: 12, paddingBottom: 4 }}>
              <View style={s.hero}>
                <Text style={s.cap}>{t('prov.home.bookingValue')}</Text>
                <Text style={s.big}>{formatPrice(q.data.total, 'TOTAL', locale) ?? '0₮'}</Text>
                <Text style={s.cap}>{t('prov.home.confirmed', { count: q.data.count })}</Text>
              </View>
              <View style={s.note}>
                <Icon name="info" size={16} color={colors.iconSecondary} />
                <Text style={s.noteText}>{t('prov.value.note')}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="calendar" title={t('prov.value.empty')} />}
          renderItem={({ item: b }) => (
            <View style={s.item}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.itemTitle} numberOfLines={1}>{b.post_title ?? b.post?.title ?? ''}</Text>
                <Text style={s.cap} numberOfLines={1}>{`${displayName(b.customer)} · ${shortRange(b.start_date.slice(0, 10), b.end_date.slice(0, 10), locale)}`}</Text>
              </View>
              <Text style={[s.itemTitle, { fontVariant: ['tabular-nums'] }]}>{formatPrice(bookingValue(b), 'TOTAL', locale) ?? ''}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
