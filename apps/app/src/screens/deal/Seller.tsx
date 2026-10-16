import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { formatDate, type Review } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { displayName, replyText, serviceAreaText, useOpenChat, useProviderReviews, useSeller } from '../../lib/deal';
import { useSaves } from '../../lib/queries';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { ReportSheet } from '../customer/ReportSheet';
import { ReviewCard } from '../../ui/ReviewCard';
import { SellerCard } from '../../ui/SellerCard';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useLocale } from '../../ui/useLocale';
import { ListingRow } from '../customer/ListingRow';
import { useRequireAuth } from '../customer/SignInFlow';
import { ReplySheet, ReviewSheet } from './ReviewSheets';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  body: { paddingHorizontal: t.spacing.screenPadding, paddingTop: 8, gap: 16 },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { ...t.type.labelStrong, color: t.colors.textLink },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noteText: { ...t.type.small, color: t.colors.textSecondary, flex: 1 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
}));

/** V1: the seller page: who they are, how they answer, their listings and newest reviews. */
export function Seller() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const openChat = useOpenChat();
  const { user: me } = useAuth();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Seller'>>();
  const q = useSeller(params.id);
  const reviews = useProviderReviews(params.id, 'new', 1);
  const { isSaved, toggle } = useSaves();
  const [write, setWrite] = useState(false);
  const [reply, setReply] = useState<Review | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [report, setReport] = useState<Review | null>(null);
  const mine = me?.id === params.id;

  if (q.isError || !q.data) {
    return (
      <View style={s.screen}>
        <AppHeader variant="pushed" title={t('deal.seller.about')} onBack={() => nav.goBack()} />
        {q.isError ? (
          <EmptyState icon="wifi-off" title={t('customer.browse.loadFailed')} body={errorText(q.error)} actionLabel={t('common.retry')} onAction={() => void q.refetch()} />
        ) : (
          <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
        )}
      </View>
    );
  }

  const { user, jobs, listings } = q.data;
  const name = displayName(user, t('common.user'));
  const count = user.rating_count ?? 0;
  const first = listings[0];
  const rv = reviews.data;

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={name} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + insets.bottom }]}>
        <SellerCard
          name={name}
          logoUri={user.company?.logo ?? user.profile_picture}
          verified={!!user.company?.is_verified}
          meta={[t('deal.seller.memberJobs', { date: formatDate(user.date_created, locale).slice(0, 7), count: jobs }), serviceAreaText(t, user)].filter(Boolean).join('\n')}
          rating={user.rating_average != null && count > 0 ? { value: user.rating_average, count } : null}
          replyText={replyText(t, user.reply_minutes)}
        />

        <View style={s.actions}>
          {first && !mine ? <Button label={t('messages.messageProvider')} icon="message-circle" onPress={() => requireAuth('message', () => void openChat(first.id))} /> : null}
          {rv?.can_review && !mine ? <Button label={rv.own ? t('review.editRating') : t('deal.review.title')} icon="star" variant="outline" onPress={() => requireAuth('message', () => setWrite(true))} /> : null}
        </View>

        {listings.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={s.h} accessibilityRole="header">{t('customer.saved.listings', { count: listings.length })}</Text>
            {listings.map((i) => (
              <ListingRow key={i.id} item={i} saved={isSaved(i.id)} onToggleSave={(x) => void toggle(x)} onOpen={(x) => nav.push('ListingDetail', { id: x.id, item: x })} />
            ))}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <View style={s.row}>
            <Text style={s.h} accessibilityRole="header">{t('review.title')}</Text>
            {count > 0 ? (
              <Text accessibilityRole="link" suppressHighlighting style={s.link} onPress={() => nav.navigate('Reviews', { id: params.id, name })}>{`${t('review.showAll', { count })} ›`}</Text>
            ) : null}
          </View>
          {q.data.reviews.length === 0 ? <Text style={s.noteText}>{t('review.empty')}</Text> : null}
          {q.data.reviews.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              providerName={name}
              canReply={mine}
              onReply={() => {
                setReply(r);
                setReplyOpen(true);
              }}
              onReport={r.author.id !== me?.id ? () => requireAuth('report', () => setReport(r)) : undefined}
            />
          ))}
          <View style={s.note}>
            <Icon name="info" size={16} color={colors.iconSecondary} />
            <Text style={s.noteText}>{t('deal.review.rules')}</Text>
          </View>
        </View>
      </ScrollView>
      <ReviewSheet visible={write} onClose={() => setWrite(false)} provider={user} existing={rv?.own ?? null} />
      <ReplySheet visible={replyOpen} onClose={() => setReplyOpen(false)} review={reply} providerName={name} />
      <ReportSheet target={report ? { kind: 'REVIEW', review: report } : null} onClose={() => setReport(null)} />
    </View>
  );
}
