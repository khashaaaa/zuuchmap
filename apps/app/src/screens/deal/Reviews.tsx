import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { Review, ReviewSort } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { useAuth } from '../../lib/auth';
import { useProviderReviews, useSeller, displayName } from '../../lib/deal';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { ReviewCard } from '../../ui/ReviewCard';
import { ReplySheet, ReviewSheet } from './ReviewSheets';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  avg: { ...t.type.display, color: t.colors.textPrimary },
  cap: { ...t.type.caption, color: t.colors.textSecondary },
  bars: { flex: 1, gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barNum: { ...t.type.small, color: t.colors.textSecondary, width: 10, textAlign: 'right' },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: t.colors.bgSurfaceSunken, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: t.colors.statusWarning },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));

const SORTS: { value: ReviewSort; key: string }[] = [
  { value: 'new', key: 'deal.review.sortNew' },
  { value: 'high', key: 'deal.review.sortHigh' },
  { value: 'low', key: 'deal.review.sortLow' },
];

/** V2: every review of a provider, with the per-star bars and sort chips. */
export function Reviews() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Reviews'>>();
  const [sort, setSort] = useState<ReviewSort>('new');
  const q = useProviderReviews(params.id, sort, 50);
  const seller = useSeller(params.id);
  const providerName = displayName(seller.data?.user, params.name);
  const [write, setWrite] = useState(false);
  const [reply, setReply] = useState<Review | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const d = q.data;
  const max = Math.max(1, ...Object.values(d?.stats ?? { 1: 0 }));
  const mine = user?.id === params.id;

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('deal.review.allTitle', { name: providerName })} onBack={() => nav.goBack()} />
      {q.isError ? (
        <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={t('deal.mine.errorBody')} actionLabel={t('deal.retry')} onAction={() => void q.refetch()} />
      ) : (
        <FlatList
          data={d?.items ?? []}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={s.content}
          ListHeaderComponent={
            <View style={{ gap: 12, paddingBottom: 4 }}>
              {d ? (
                <View style={s.summary}>
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Text style={s.avg}>{d.average !== null ? d.average.toFixed(1) : '–'}</Text>
                    <Icon name="star" size={18} color={colors.statusWarning} fill={colors.statusWarning} />
                    <Text style={s.cap}>{t('review.count', { count: d.count })}</Text>
                  </View>
                  <View style={s.bars}>
                    {(['5', '4', '3', '2', '1'] as const).map((k) => (
                      <View key={k} style={s.barRow}>
                        <Text style={s.barNum}>{k}</Text>
                        <View style={s.track}><View style={[s.fill, { width: `${(d.stats[k] / max) * 100}%` }]} /></View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              <View style={s.wrap}>
                {SORTS.map((o) => <Chip key={o.value} label={t(o.key)} selected={sort === o.value} onPress={() => setSort(o.value)} />)}
              </View>
              {d?.can_review && !mine ? <Button label={d.own ? t('review.editRating') : t('deal.review.title')} icon="star" size="medium" variant="outline" onPress={() => setWrite(true)} /> : null}
            </View>
          }
          ListEmptyComponent={q.isLoading ? null : <EmptyState icon="star" title={t('review.empty')} />}
          renderItem={({ item: r }) => (
            <ReviewCard
              review={r}
              providerName={providerName}
              canReply={mine}
              onReply={() => {
                setReply(r);
                setReplyOpen(true);
              }}
            />
          )}
        />
      )}
      {seller.data ? <ReviewSheet visible={write} onClose={() => setWrite(false)} provider={seller.data.user} existing={d?.own ?? null} /> : null}
      <ReplySheet visible={replyOpen} onClose={() => setReplyOpen(false)} review={reply} providerName={providerName} />
    </View>
  );
}
