import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { Booking, ReceivedBookingsTab } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { shortRange } from '../../lib/dates';
import { displayName, useBookingAction, useOpenChat, useReceivedBookings } from '../../lib/deal';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';
import { BookingCard } from './BookingCard';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  seg: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 8 },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 12, flexGrow: 1 },
  note: { ...t.type.small, color: t.colors.textSecondary },
}));

const TABS: ReceivedBookingsTab[] = ['new', 'accepted', 'past'];

/** The days two bookings share, as `a – b`. */
function overlapRange(a: Booking, b: Booking): [string, string] {
  const from = a.start_date.slice(0, 10) > b.start_date.slice(0, 10) ? a.start_date.slice(0, 10) : b.start_date.slice(0, 10);
  const to = a.end_date.slice(0, 10) < b.end_date.slice(0, 10) ? a.end_date.slice(0, 10) : b.end_date.slice(0, 10);
  return [from, to];
}

/** E3/E5/E7/E14/E15: requests on the provider's listings. */
export function BookingRequests() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const openChat = useOpenChat();
  const act = useBookingAction();
  const [tab, setTab] = useState<ReceivedBookingsTab>('new');
  const q = useReceivedBookings(tab);
  const counts = q.data?.counts;
  const [declining, setDeclining] = useState<{ b: Booking; open: boolean } | null>(null);
  const [reply, setReply] = useState('');

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const overlapsFor = (b: Booking): string[] =>
    (b.conflicts ?? []).flatMap((id) => {
      const other = items.find((x) => x.id === id);
      if (!other) return [];
      const [a, z] = overlapRange(b, other);
      return [t('deal.received.overlap', { dates: shortRange(a, z, locale), name: displayName(other.customer) })];
    });

  // Only "new" carries its count (E3): three counted labels do not fit a phone-width segmented control.
  const label = (k: ReceivedBookingsTab) => (counts && k === 'new' ? t('deal.tabCount', { label: t(`deal.received.${k}`), count: counts[k] }) : t(`deal.received.${k}`));
  const chat = (b: Booking) => {
    if (b.conversation_id) nav.navigate('Thread', { id: b.conversation_id });
    else if (b.post_id) void openChat(b.post_id);
  };

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('deal.received.title')} onBack={() => nav.goBack()} />
      <View style={s.seg}>
        <SegmentedControl<ReceivedBookingsTab> value={tab} onChange={setTab} segments={TABS.map((k) => ({ value: k, label: label(k) }))} />
      </View>
      {q.isLoading ? (
        <View style={[s.content, { gap: 12 }]}><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : q.isError ? (
        <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={t('deal.mine.errorBody')} actionLabel={t('deal.retry')} onAction={() => void q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.iconSecondary} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 8 }}>
              <EmptyState icon="calendar" title={t('deal.received.emptyTitle')} body={t('deal.received.emptyBody')} />
              <Button label={t('deal.received.emptyAction')} size="medium" variant="outline" onPress={() => nav.navigate('BlockDays')} />
            </View>
          }
          renderItem={({ item: b }) => (
            <BookingCard
              booking={b}
              overlaps={overlapsFor(b)}
              busy={act.isPending && act.variables?.id === b.id}
              onOpenListing={() => b.post && nav.navigate('ListingDetail', { id: b.post.id, item: b.post })}
              onChat={() => chat(b)}
              onAccept={() =>
                act.mutate({ id: b.id, action: 'accept' }, { onSuccess: () => toast.show({ message: t('deal.status.ACCEPTED'), kind: 'success' }) })
              }
              onDecline={() => {
                setReply('');
                setDeclining({ b, open: true });
              }}
            />
          )}
        />
      )}

      <BottomSheet
        visible={!!declining?.open}
        onClose={() => declining && setDeclining({ ...declining, open: false })}
        title={t('deal.received.declineTitle')}
        footerLabel={t('deal.received.decline')}
        footerDisabled={act.isPending}
        onFooter={() => {
          const d = declining;
          if (!d) return;
          setDeclining({ ...d, open: false });
          act.mutate({ id: d.b.id, action: 'decline', response_message: reply });
        }}
      >
        {declining ? (
          <Text style={s.note}>
            {t('deal.received.declineBody', { name: displayName(declining.b.customer), dates: shortRange(declining.b.start_date.slice(0, 10), declining.b.end_date.slice(0, 10), locale) })}
          </Text>
        ) : null}
        <TextField label={t('booking.responseMessage')} value={reply} onChangeText={setReply} placeholder={t('deal.received.responsePlaceholder')} multiline maxLength={500} />
      </BottomSheet>
    </View>
  );
}
