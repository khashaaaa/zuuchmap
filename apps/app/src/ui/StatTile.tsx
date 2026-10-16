import { Text, View } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export interface StatTileProps {
  icon: string;
  label: string;
  /** Already formatted ("1,248"). */
  value: string;
  /** "+18% ..." Up shows success tone; flat shows tertiary. */
  delta?: { text: string; trend: 'up' | 'flat' };
}

export function StatTile({ icon, label, value, delta }: StatTileProps) {
  const { colors, type, radius } = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${delta ? `, ${delta.text}` : ''}`}
      style={{ flex: 1, gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.card, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderSubtle }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={16} color={colors.iconSecondary} />
        <Text style={[type.small, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[type.h2, { color: colors.textPrimary, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{value}</Text>
      {delta ? <Text style={[type.small, { color: delta.trend === 'up' ? colors.statusSuccess : colors.textTertiary }]} numberOfLines={2}>{delta.text}</Text> : null}
    </View>
  );
}
