import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { Booking, MyBookingsTab } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { setBrowse } from '../../lib/browse';
import { shortRange } from '../../lib/dates';
import { displayName, useBookingAction, useMyBookings, useOpenChat } from '../../lib/deal';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { EmptyState } from '../../ui/EmptyState';
import { Modal } from '../../ui/Modal';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useLocale } from '../../ui/useLocale';
import { BookingCard } from './BookingCard';
import { BookingSheet } from '../customer/DetailSheets';
import { ReviewSheet } from './ReviewSheets';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  seg: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 8 },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 12, flexGrow: 1 },
}));

/** U1-U5: the customer's requests. */
export function MyBookings() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const openChat = useOpenChat();
  const act = useBookingAction();
  const [tab, setTab] = useState<MyBookingsTab>('active');
  const q = useMyBookings(tab);
  const counts = q.data?.counts;
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  // The sheets keep the last booking so they can slide out after `open` goes false.
  const [again, setAgain] = useState<{ b: Booking; open: boolean } | null>(null);
  const [rating, setRating] = useState<{ b: Booking; open: boolean } | null>(null);

  const label = (k: MyBookingsTab) => (counts ? t('deal.tabCount', { label: t(`deal.mine.${k}`), count: counts[k] }) : t(`deal.mine.${k}`));
  const chat = (b: Booking) => {
    if (b.conversation_id) nav.navigate('Thread', { id: b.conversation_id });
    else if (b.post_id) void openChat(b.post_id);
  };

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('deal.mine.title')} onBack={() => nav.goBack()} />
      <View style={s.seg}>
        <SegmentedControl<MyBookingsTab> value={tab} onChange={setTab} segments={[{ value: 'active', label: label('active') }, { value: 'past', label: label('past') }]} />
      </View>
      {q.isLoading ? (
        <View style={[s.content, { gap: 12 }]}><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : q.isError ? (
        <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={t('deal.mine.errorBody')} actionLabel={t('deal.retry')} onAction={() => void q.refetch()} />
      ) : (
        <FlatList
          data={q.data?.items ?? []}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.iconSecondary} />}
          ListEmptyComponent={
            <EmptyState
              icon="calendar"
              title={t('deal.mine.emptyTitle')}
              body={t('deal.mine.emptyBody')}
              actionLabel={t('deal.mine.emptyAction')}
              onAction={() => nav.navigate('Tabs', { screen: 'browse' })}
            />
          }
          renderItem={({ item: b }) => (
            <BookingCard
              booking={b}
              busy={act.isPending && act.variables?.id === b.id}
              onOpenListing={() => b.post && nav.navigate('ListingDetail', { id: b.post.id, item: b.post })}
              onChat={() => chat(b)}
              onCancel={() => setCancelling(b)}
              onRate={() => setRating({ b, open: true })}
              onBookAgain={() => setAgain({ b, open: true })}
              onFindSimilar={() => {
                setBrowse({ category: b.category, family: undefined, subcategory: b.post?.subcategory ?? undefined, q: '' });
                nav.navigate('Tabs', { screen: 'browse' });
              }}
            />
          )}
        />
      )}

      <Modal
        visible={!!cancelling}
        onClose={() => setCancelling(null)}
        title={t('deal.mine.cancelTitle')}
        body={cancelling ? t('deal.mine.cancelBody', { listing: cancelling.post_title ?? '', dates: shortRange(cancelling.start_date.slice(0, 10), cancelling.end_date.slice(0, 10), locale), name: displayName(cancelling.provider) }) : undefined}
        icon="calendar"
        iconTone="warning"
        cancelLabel={t('deal.mine.keep')}
        confirmLabel={t('deal.mine.cancel')}
        onConfirm={() => {
          const b = cancelling;
          setCancelling(null);
          if (b) act.mutate({ id: b.id, action: 'cancel' });
        }}
      />
      {again?.b.post ? <BookingSheet visible={again.open} onClose={() => setAgain({ ...again, open: false })} listing={again.b.post} onNeedsAuth={() => setAgain({ ...again, open: false })} /> : null}
      {rating ? (
        <ReviewSheet
          visible={rating.open}
          onClose={() => setRating({ ...rating, open: false })}
          provider={rating.b.provider}
          existing={null}
          context={{ listing: rating.b.post_title ?? '', dates: shortRange(rating.b.start_date.slice(0, 10), rating.b.end_date.slice(0, 10), locale) }}
        />
      ) : null}
    </View>
  );
}
