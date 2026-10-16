import { Text, View } from 'react-native';
import { useAppTheme } from '../design/theme';

export interface MapPinProps {
  kind: 'price' | 'selected' | 'cluster';
  /** price / selected: the full price ("450,000₮", never compact). cluster: the count. */
  label: string;
}

/**
 * Plain Views, no shadow and no elevation: Android rasterises custom markers into a small bitmap and a shadow would clip.
 * Keep the whole pin inside the marker bounds (scale is applied as a transform on the bubble only).
 */
export function MapPin({ kind, label }: MapPinProps) {
  const { colors, type } = useAppTheme();
  if (kind === 'cluster') {
    return (
      <View
        accessibilityLabel={label}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSurface, borderWidth: 2, borderColor: colors.textPrimary }}
      >
        <Text style={[type.labelStrong, { color: colors.textPrimary }]}>{label}</Text>
      </View>
    );
  }
  const on = kind === 'selected';
  const fill = on ? colors.actionSecondary : colors.bgSurface;
  const stroke = on ? colors.actionSecondary : colors.borderDefault;
  return (
    <View accessibilityLabel={label} style={{ alignItems: 'center', transform: [{ scale: on ? 1.2 : 1 }] }}>
      <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9999, backgroundColor: fill, borderWidth: 1, borderColor: stroke }}>
        <Text style={[type.labelStrong, { color: on ? colors.actionOnSecondary : colors.textPrimary }]} numberOfLines={1}>{label}</Text>
      </View>
      {/* Pointer: a 12x7 downward triangle from borders. */}
      <View
        style={{
          width: 0, height: 0, marginTop: -1, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7,
          borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: fill,
        }}
      />
    </View>
  );
}
