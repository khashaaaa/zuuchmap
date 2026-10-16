import { Text, type StyleProp, type ViewStyle } from 'react-native';
import { categoryColor } from '@zuuchmap/tokens';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

export type ChipType = 'filter' | 'category' | 'removable';

export interface ChipProps {
  label: string;
  type?: ChipType;
  selected?: boolean;
  /** Category chips: the category key (colours the glyph) and its icon name. */
  categoryKey?: string;
  icon?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  forcePressed?: boolean;
}

export function Chip({ label, type: kind = 'filter', selected, categoryKey, icon, onPress, style, forcePressed }: ChipProps) {
  const { colors, type, scheme } = useAppTheme();
  const { t } = useTranslation();
  const removable = kind === 'removable';
  const on = !!selected && !removable;
  const fill = removable ? colors.bgSurfaceSunken : on ? colors.actionSecondary : colors.bgSurface;
  const fg = on ? colors.actionOnSecondary : colors.textPrimary;
  const glyph = on ? colors.actionOnSecondary : categoryKey ? categoryColor(categoryKey, scheme).fill : colors.iconPrimary;
  return (
    <PressableScale
      onPress={onPress}
      forcePressed={forcePressed}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole={removable ? 'button' : 'checkbox'}
      accessibilityLabel={removable ? t('ui.removeChip', { label }) : label}
      accessibilityState={removable ? undefined : { checked: on }}
      style={[{ alignSelf: 'flex-start' }, style]}
      contentStyle={{
        height: 36,
        paddingHorizontal: 12,
        gap: 6,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 9999,
        backgroundColor: fill,
        borderWidth: !removable && !on ? 1 : 0,
        borderColor: colors.borderDefault,
      }}
    >
      {kind === 'category' && icon ? <Icon name={icon} categoryKey={categoryKey} size={18} color={glyph} /> : null}
      <Text style={[type.labelStrong, { color: fg }]} numberOfLines={1}>{label}</Text>
      {removable ? <Icon name="x" size={16} color={colors.iconPrimary} /> : null}
    </PressableScale>
  );
}
