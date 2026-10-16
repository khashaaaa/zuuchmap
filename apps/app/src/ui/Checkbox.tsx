import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onChange?: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/** The whole row is the 48 px target. Checked is ink, not amber. */
export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  const { colors, type } = useAppTheme();
  const filled = checked !== false;
  return (
    <Pressable
      onPress={() => onChange?.(checked !== true)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: checked === 'indeterminate' ? 'mixed' : checked, disabled: !!disabled }}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View
        style={{
          width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
          backgroundColor: filled ? colors.actionSecondary : colors.bgSurface,
          borderWidth: filled ? 0 : 1.5, borderColor: colors.borderStrong, opacity: disabled ? 0.4 : 1,
        }}
      >
        {filled ? <Icon name={checked === 'indeterminate' ? 'minus' : 'check'} size={16} color={colors.actionOnSecondary} strokeWidth={2.5} /> : null}
      </View>
      {label ? <Text style={[type.body, { color: disabled ? colors.textDisabled : colors.textPrimary, flexShrink: 1 }]}>{label}</Text> : null}
    </Pressable>
  );
}
