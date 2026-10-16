import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '@zuuchmap/tokens';

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Visual box. Receives the pressed state so a fill can change. */
  contentStyle?: StyleProp<ViewStyle> | ((pressed: boolean) => StyleProp<ViewStyle>);
  children?: ReactNode | ((pressed: boolean) => ReactNode);
  /** Gallery only: render as pressed. */
  forcePressed?: boolean;
  /** Layout of the touch area (width, margins). */
  style?: StyleProp<ViewStyle>;
}

/** Pressable whose visual box scales to `scalePress` while held. Honours reduce-motion. */
export function PressableScale({ contentStyle, children, forcePressed, style, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);

  const to = (v: number) => {
    if (reduce) return;
    Animated.timing(scale, { toValue: v, duration: motion.durationInstant, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      {...rest}
      style={style}
      onPressIn={(e) => {
        to(motion.scalePress);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
    >
      {({ pressed }) => {
        const p = pressed || !!forcePressed;
        const cs = typeof contentStyle === 'function' ? contentStyle(p) : contentStyle;
        return (
          <Animated.View style={[cs, { transform: [{ scale: forcePressed ? motion.scalePress : scale }] }]}>
            {typeof children === 'function' ? children(p) : children}
          </Animated.View>
        );
      }}
    </Pressable>
  );
}
