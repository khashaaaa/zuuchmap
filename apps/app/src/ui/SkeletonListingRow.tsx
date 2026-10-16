import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useAppTheme } from '../design/theme';
import { useReduceMotion } from './useReduceMotion';

/** Same geometry as ListingCard row. 900 ms opacity pulse; still when reduce-motion is on. */
export function SkeletonListingRow() {
  const { colors, radius } = useAppTheme();
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);

  const bar = (w: number | `${number}%`, h: number) => <View style={{ width: w, maxWidth: '100%', height: h, borderRadius: radius.sm, backgroundColor: colors.bgSurfaceSunken }} />;
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ opacity: pulse, flexDirection: 'row', gap: 14, padding: 12, borderRadius: radius.card, backgroundColor: colors.bgSurface }}
    >
      <View style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.bgSurfaceSunken }} />
      <View style={{ flex: 1, gap: 10, paddingVertical: 4 }}>
        {bar(198, 16)}
        {bar(132, 12)}
        {bar(99, 12)}
        {bar(77, 12)}
      </View>
    </Animated.View>
  );
}
