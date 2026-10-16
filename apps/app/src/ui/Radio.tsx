import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../design/theme';

export interface RadioProps {
  selected: boolean;
  onPress?: () => void;
  label: string;
  disabled?: boolean;
}

/** Ink ring with a surface dot when on. The whole row is the 48 px target. */
export function Radio({ selected, onPress, label, disabled }: RadioProps) {
  const { colors, type } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View
        style={{
          width: 22, height: 22, borderRadius: 9999, backgroundColor: colors.bgSurface, opacity: disabled ? 0.4 : 1,
          borderWidth: selected ? 6 : 1.5, borderColor: selected ? colors.actionSecondary : colors.borderStrong,
        }}
      />
      <Text style={[type.body, { color: disabled ? colors.textDisabled : colors.textPrimary, flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}
