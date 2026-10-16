import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { elevationCss } from '@zuuchmap/tokens';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';
import { useReduceMotion } from './useReduceMotion';

export interface Segment<V extends string> {
  value: V;
  /** Empty for an icon-only segment; then `a11yLabel` names it. */
  label: string;
  icon?: string;
  a11yLabel?: string;
}

export interface SegmentedControlProps<V extends string> {
  segments: Segment<V>[];
  value: V;
  onChange: (value: V) => void;
}

/** Selected segment is a raised surface, not amber: one pill that slides under the labels. Its shadow is a
 *  CSS boxShadow: Android's `elevation` drew a square shadow behind the pill. */
export function SegmentedControl<V extends string>({ segments, value, onChange }: SegmentedControlProps<V>) {
  const { colors, type } = useAppTheme();
  const reduce = useReduceMotion();
  const index = Math.max(0, segments.findIndex((s) => s.value === value));
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (reduce) x.setValue(index);
    else Animated.spring(x, { toValue: index, friction: 9, tension: 90, useNativeDriver: true }).start();
  }, [index, reduce, x]);
  // 4 px padding and 4 px gaps around equal segments.
  const seg = (width - 8 - 4 * (segments.length - 1)) / segments.length;
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ minHeight: 44, padding: 4, gap: 4, flexDirection: 'row', borderRadius: 9999, backgroundColor: colors.bgSurfaceSunken }}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 4, bottom: 4, left: 4, width: seg, borderRadius: 9999, backgroundColor: colors.bgSurface, boxShadow: elevationCss.sm,
            transform: [{ translateX: Animated.multiply(x, seg + 4) }],
          }}
        />
      ) : null}
      {segments.map((s) => {
        const on = s.value === value;
        return (
          <Pressable
            key={s.value}
            onPress={() => onChange(s.value)}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="tab"
            accessibilityLabel={s.a11yLabel ?? s.label}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 36, paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 9999 }}
          >
            {s.icon ? <Icon name={s.icon} size={18} color={on ? colors.textPrimary : colors.textSecondary} /> : null}
            {s.label ? <Text numberOfLines={1} adjustsFontSizeToFit style={[type.labelStrong, { flexShrink: 1, color: on ? colors.textPrimary : colors.textSecondary }]}>{s.label}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
