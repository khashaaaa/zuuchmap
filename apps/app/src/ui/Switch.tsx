import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { motion } from '@zuuchmap/tokens';
import { useAppTheme } from '../design/theme';

export interface SwitchProps {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  /** Required: a switch has no visible text of its own. */
  label: string;
  disabled?: boolean;
}

export function Switch({ value, onValueChange, label, disabled }: SwitchProps) {
  const { colors } = useAppTheme();
  const x = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: motion.durationFast, useNativeDriver: true }).start();
  }, [value, x]);
  return (
    <Pressable
      onPress={() => onValueChange?.(!value)}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={{
        width: 52, height: 32, borderRadius: 9999, padding: 3, alignSelf: 'flex-start', opacity: disabled ? 0.4 : 1,
        backgroundColor: value ? colors.actionSecondary : colors.controlTrack,
      }}
    >
      <Animated.View
        style={{
          width: 26, height: 26, borderRadius: 9999,
          backgroundColor: value ? colors.actionOnSecondary : colors.controlThumb,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
        }}
      />
    </Pressable>
  );
}
