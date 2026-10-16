import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { useReduceMotion } from './useReduceMotion';

export type IconButtonVariant = 'surface' | 'ghost' | 'primary' | 'media';

export interface IconButtonProps {
  icon: string;
  /** Required: icon-only controls need a spoken name. */
  label: string;
  onPress?: () => void;
  variant?: IconButtonVariant;
  size?: 'large' | 'medium';
  disabled?: boolean;
  /** Fill the glyph (saved heart, selected star). */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
  forcePressed?: boolean;
}

export function IconButton({ icon, label, onPress, variant = 'surface', size = 'large', disabled, filled, style, forcePressed }: IconButtonProps) {
  const { colors } = useAppTheme();
  const reduce = useReduceMotion();
  // Turning on (saving) pops the glyph; the first render and turning off stay still.
  const pop = useRef(new Animated.Value(1)).current;
  const was = useRef(filled);
  useEffect(() => {
    if (filled && !was.current && !reduce) {
      pop.setValue(0.6);
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
    }
    was.current = filled;
  }, [filled, reduce, pop]);
  const box = size === 'large' ? 48 : 40;
  const bg = { surface: colors.bgSurfaceSunken, ghost: 'transparent', primary: colors.actionPrimary, media: colors.bgMediaScrim }[variant];
  const fg = disabled
    ? colors.textDisabled
    : { surface: colors.iconPrimary, ghost: colors.iconPrimary, primary: colors.actionOnPrimary, media: colors.textOnMedia }[variant];
  const glyph = filled && icon === 'heart' && !disabled ? colors.actionPrimary : fg;
  const slop = (48 - box) / 2;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      forcePressed={forcePressed}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={slop > 0 ? { top: slop, bottom: slop, left: slop, right: slop } : undefined}
      style={[{ alignSelf: 'flex-start' }, style]}
      contentStyle={{ width: box, height: box, borderRadius: 9999, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Icon name={icon} size={size === 'large' ? 24 : 20} color={glyph} fill={filled ? glyph : undefined} />
      </Animated.View>
    </PressableScale>
  );
}
