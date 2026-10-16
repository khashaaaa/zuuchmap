import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDate, type Review } from '@zuuchmap/core';
import { useAppTheme } from '../design/theme';
import { displayName } from '../lib/deal';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { useLocale } from './useLocale';

export interface ReviewCardProps {
  review: Review;
  /** Name shown on the provider's reply. */
  providerName: string;
  /** The viewer is the reviewed provider: offers reply / edit reply. */
  canReply?: boolean;
  onReply?: () => void;
}

/** A review with the provider's reply under it. */
export function ReviewCard({ review, providerName, canReply, onReply }: ReviewCardProps) {
  const { colors, type, radius } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const name = displayName(review.author, t('common.user'));
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: radius.card, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderSubtle }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar size="small" name={name} uri={review.author.profile_picture} />
        <View style={{ flex: 1 }}>
          <Text style={[type.labelStrong, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <Text style={[type.small, { color: colors.textSecondary }]}>{formatDate(review.date_created, locale)}</Text>
        </View>
        <View accessible accessibilityLabel={t('kit.rating', { value: review.rating })} style={{ flexDirection: 'row', gap: 1 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Icon key={i} name="star" size={14} color={i <= review.rating ? colors.statusWarning : colors.borderStrong} fill={i <= review.rating ? colors.statusWarning : undefined} />
          ))}
        </View>
      </View>
      {review.comment ? <Text style={[type.body, { color: colors.textPrimary }]}>{review.comment}</Text> : null}
      {review.reply ? (
        <View style={{ gap: 4, padding: 12, borderRadius: radius.lg, backgroundColor: colors.bgSurfaceSunken }}>
          <Text style={[type.overline, { color: colors.textSecondary }]}>{t('deal.review.replied', { name: providerName })}</Text>
          <Text style={[type.caption, { color: colors.textPrimary }]}>{review.reply}</Text>
        </View>
      ) : null}
      {canReply ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onReply} style={{ alignSelf: 'flex-start' }}>
          <Text style={[type.labelStrong, { color: colors.textLink }]}>{review.reply ? t('deal.review.replyEdit') : t('deal.review.replyTitle')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
