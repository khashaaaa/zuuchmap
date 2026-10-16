import { Image, Text, View } from 'react-native';
import { categoryColor } from '@zuuchmap/tokens';
import { formatPriceParts } from '@zuuchmap/core';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { PressableScale } from './PressableScale';
import { StatusBadge, type Status } from './StatusBadge';
import { useLocale } from './useLocale';

export interface MyListingRowProps {
  title: string;
  status: Status;
  categoryKey: string;
  categoryIcon?: string;
  photoUri?: string | null;
  price?: { amount: number | string; unit?: string | null } | null;
  /** "128 үзэлт · 6 хадгалсан · 3 хоног үлдсэн" */
  meta?: string;
  /** Pill under the meta: "Онцлох" on a live listing, "Сунгах" on an expired one. */
  action?: { label: string; icon: string; onPress: () => void };
  /** Why an edit was refused (names the field). */
  rejectionNote?: string;
  onPress?: () => void;
  onMore?: () => void;
}

export function MyListingRow({ title, status, categoryKey, categoryIcon = 'package', photoUri, price, meta, action, rejectionNote, onPress, onMore }: MyListingRowProps) {
  const { colors, type, elevation, radius, scheme } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const cat = categoryColor(categoryKey, scheme);
  const parts = price ? formatPriceParts(price.amount, price.unit, locale) : null;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      contentStyle={[elevation.sm, { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 8, borderRadius: radius.card, backgroundColor: colors.bgSurface }]}
    >
      <View style={{ width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: photoUri ? colors.bgSurfaceSunken : cat.fill + '29' }}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
        ) : (
          <View style={{ opacity: 0.7 }}>
            <Icon name={categoryIcon} categoryKey={categoryKey} size={28} color={cat.fill} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <StatusBadge status={status} />
        <Text style={[type.bodyBold, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
        {parts ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexShrink: 1 }}>
            <Text style={[type.labelStrong, { color: colors.textPrimary }]}>{parts.amount}</Text>
            {parts.unit ? <Text style={[type.body, { color: colors.textSecondary }]} numberOfLines={1}>{` / ${parts.unit}`}</Text> : null}
          </View>
        ) : null}
        {meta ? <Text style={[type.small, { color: colors.textSecondary }]}>{meta}</Text> : null}
        {action ? (
          <PressableScale
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={{ top: 6, bottom: 6 }}
            style={{ alignSelf: 'flex-start' }}
            contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingLeft: 10, paddingRight: 12, borderRadius: 9999, backgroundColor: colors.actionPrimaryTint }}
          >
            <Icon name={action.icon} size={16} color={colors.iconAccent} />
            <Text style={[type.labelStrong, { color: colors.textLink }]}>{action.label}</Text>
          </PressableScale>
        ) : null}
        {rejectionNote ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.statusDangerTint }}>
            <View style={{ paddingTop: 1.5 }}>
              <Icon name="circle-alert" size={14} color={colors.statusDanger} />
            </View>
            <Text style={[type.small, { flex: 1, color: colors.textPrimary }]}>{rejectionNote}</Text>
          </View>
        ) : null}
      </View>
      {onMore ? <IconButton icon="more-horizontal" label={t('common.more')} variant="ghost" size="medium" onPress={onMore} style={{ marginTop: -4 }} /> : null}
    </PressableScale>
  );
}
