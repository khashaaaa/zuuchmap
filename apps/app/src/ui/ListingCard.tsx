import { Image, Text, View } from 'react-native';
import { categoryColor } from '@zuuchmap/tokens';
import { formatPriceParts } from '@zuuchmap/core';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { FeaturedMark } from './FeaturedMark';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { PressableScale } from './PressableScale';
import { StatusBadge } from './StatusBadge';
import { useLocale } from './useLocale';

export interface ListingCardProps {
  title: string;
  categoryKey: string;
  /** Lucide name for the no-photo glyph; an unshipped name falls back to the category family icon. */
  categoryIcon?: string;
  /** Grid only: the category name over the title. */
  categoryLabel?: string;
  photoUri?: string | null;
  /** "Хан-Уул · 2 цагийн өмнө" */
  meta?: string;
  price?: { amount: number | string; unit?: string | null } | null;
  featured?: boolean;
  saved?: boolean;
  onToggleSave?: () => void;
  onPress?: () => void;
  /** The search carries dates: show availability and the total. */
  dates?: boolean;
  availability?: 'available' | 'busy';
  /** "3 өдөр · 1,350,000₮"; only shown when `dates` is set. */
  total?: string;
  /** Row for phone lists; grid for tablets. */
  layout?: 'row' | 'grid';
}

export function ListingCard({
  title, categoryKey, categoryIcon = 'package', categoryLabel, photoUri, meta, price, featured, saved, onToggleSave, onPress,
  dates, availability, total, layout = 'row',
}: ListingCardProps) {
  const { colors, type, elevation, radius, scheme } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const grid = layout === 'grid';
  const cat = categoryColor(categoryKey, scheme);
  const parts = price ? formatPriceParts(price.amount, price.unit, locale) : null;

  const photo = (
    <View
      style={[
        grid ? { width: '100%', aspectRatio: 4 / 3 } : { width: 108, height: 108 },
        { borderRadius: grid ? 0 : radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: photoUri ? colors.bgSurfaceSunken : cat.fill + '29' },
      ]}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={{ opacity: 0.7 }}>
          <Icon name={categoryIcon} categoryKey={categoryKey} size={grid ? 67 : 35} color={cat.fill} />
        </View>
      )}
      {featured ? (
        <View style={{ position: 'absolute', top: 8, left: 8 }}>
          <FeaturedMark />
        </View>
      ) : null}
      {grid && onToggleSave ? (
        <View style={{ position: 'absolute', top: 8, right: 8 }}>
          <IconButton icon="heart" label={t('common.save')} variant="media" size="medium" filled={saved} onPress={onToggleSave} />
        </View>
      ) : null}
    </View>
  );

  const metaRow = meta ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name="map-pin" size={14} color={colors.iconSecondary} />
      <Text style={[type.caption, { flex: 1, color: colors.textSecondary }]} numberOfLines={1}>{meta}</Text>
    </View>
  ) : null;

  const priceRow = parts ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4, flexShrink: 1 }}>
      <Text style={[type.price, { color: colors.textPrimary, flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit>{parts.amount}</Text>
      {parts.unit ? <Text style={[type.caption, { color: colors.textSecondary, flexShrink: 1 }]} numberOfLines={1}>{`/ ${parts.unit}`}</Text> : null}
    </View>
  ) : null;

  const totalLine = dates && total ? <Text style={[type.labelStrong, { color: colors.statusSuccess }]} numberOfLines={1}>{total}</Text> : null;
  const badge = dates && availability ? <StatusBadge status={availability} /> : null;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, meta, parts ? `${parts.amount}${parts.unit ? ` / ${parts.unit}` : ''}` : null].filter(Boolean).join(', ')}
      contentStyle={[
        elevation.sm,
        { borderRadius: radius.card, backgroundColor: colors.bgSurface, overflow: grid ? 'hidden' : undefined },
        grid ? null : { flexDirection: 'row', padding: 12, gap: 14 },
      ]}
    >
      {photo}
      {grid ? (
        <View style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 6 }}>
          {categoryLabel ? <Text style={[type.overline, { color: cat.text }]} numberOfLines={1}>{categoryLabel}</Text> : null}
          <Text style={[type.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
          {metaRow}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {priceRow}
            {badge}
          </View>
          {totalLine}
        </View>
      ) : (
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, marginTop: -4 }}>
            <View>{badge}</View>
            {onToggleSave ? <IconButton icon="heart" label={t('common.save')} variant="ghost" size="medium" filled={saved} onPress={onToggleSave} style={{ marginRight: -8 }} /> : null}
          </View>
          <Text style={[type.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
          {metaRow}
          {priceRow}
          {totalLine}
        </View>
      )}
    </PressableScale>
  );
}
