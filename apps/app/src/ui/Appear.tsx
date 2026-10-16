import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '@zuuchmap/tokens';
import { useReduceMotion } from './useReduceMotion';

export interface AppearProps {
  /** Position in a list: the first 8 enter `durationStagger` apart, later ones with no delay. */
  index?: number;
  /** Rise 8 px while fading in (list rows); off for whole views. */
  rise?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** Fades its children in once, on mount. Key it to replay (a new result set, list ↔ map). */
export function Appear({ index = 0, rise = true, style, children }: AppearProps) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return t.setValue(1);
    Animated.timing(t, { toValue: 1, duration: motion.durationNormal, delay: index < 8 ? index * motion.durationStagger : 0, useNativeDriver: true }).start();
  }, [t, index, reduce]);
  const transform = rise ? [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] : [];
  return <Animated.View style={[style, { opacity: t, transform }]}>{children}</Animated.View>;
}
