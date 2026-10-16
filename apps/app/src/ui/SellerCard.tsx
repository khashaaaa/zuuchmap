import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export interface SellerCardProps {
  name: string;
  logoUri?: string | null;
  verified?: boolean;
  /** "2024.03-оос гишүүн · 38 ажил" */
  meta?: string;
  rating?: { value: number; count: number } | null;
  replyHours?: number;
  /** Already-worded reply time ("Ихэвчлэн 2 цагт хариулдаг"); wins over `replyHours`. */
  replyText?: string;
  /** Opens the seller page. */
  onPress?: () => void;
}

export function SellerCard({ name, logoUri, verified, meta, rating, replyHours, replyText, onPress }: SellerCardProps) {
  const { colors, type, radius } = useAppTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? name : undefined}
      style={{ gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderSubtle }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar size="large" kind="company" name={name} uri={logoUri} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[type.title, { flexShrink: 1, color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
            {verified ? <Icon name="badge-check" size={18} color={colors.iconAccent} /> : null}
          </View>
          {meta ? <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={2}>{meta}</Text> : null}
        </View>
        {onPress ? <Icon name="chevron-right" size={20} color={colors.iconSecondary} /> : null}
      </View>
      {rating || replyHours || replyText ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 6 }}>
          {rating ? (
            <View accessible accessibilityLabel={t('kit.rating', { value: rating.value.toFixed(1) })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="star" size={16} color={colors.statusWarning} fill={colors.statusWarning} />
              <Text style={[type.labelStrong, { color: colors.textPrimary }]}>{rating.value.toFixed(1)}</Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>{`(${rating.count})`}</Text>
            </View>
          ) : null}
          {replyHours || replyText ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={16} color={colors.iconSecondary} />
              <Text style={[type.caption, { color: colors.textSecondary }]}>{replyText ?? t('ui.repliesIn', { hours: replyHours })}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
