import { ActivityIndicator, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';
export type ButtonSize = 'large' | 'medium';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Lucide kebab name for a leading icon. */
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Gallery only: render the Pressed state. */
  forcePressed?: boolean;
  testID?: string;
}

export function Button({ label, onPress, variant = 'primary', size = 'large', icon, loading, disabled, fullWidth, style, forcePressed, testID }: ButtonProps) {
  const { colors, type, radius } = useAppTheme();
  const large = size === 'large';
  const off = !!disabled || !!loading;

  const fillFor = (pressed: boolean): string => {
    if (disabled) return colors.bgSurfaceSunken;
    switch (variant) {
      case 'primary': return pressed ? colors.actionPrimaryPressed : colors.actionPrimary;
      case 'secondary': return pressed ? colors.actionSecondary + 'db' : colors.actionSecondary; // 86%
      case 'outline': return pressed ? colors.bgSurfaceSunken : 'transparent';
      case 'danger': return colors.statusDangerFill;
    }
  };
  const fg = disabled
    ? colors.textDisabled
    : { primary: colors.actionOnPrimary, secondary: colors.actionOnSecondary, outline: colors.textPrimary, danger: colors.textOnColor }[variant];
  // Outline keeps a 1.5 px stroke except when disabled; others keep a transparent border so every state is the same size.
  const stroke = variant === 'outline' && !disabled ? colors.borderDefault : 'transparent';

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={off}
      forcePressed={forcePressed}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!loading }}
      hitSlop={large ? undefined : { top: 4, bottom: 4 }}
      style={[fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}
      contentStyle={(pressed) => ({
        minHeight: large ? 48 : 40,
        paddingHorizontal: large ? 20 : 16,
        borderRadius: radius.button,
        borderWidth: 1.5,
        borderColor: stroke,
        backgroundColor: fillFor(pressed),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      })}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={large ? 20 : 18} color={fg} /> : null}
      <Text style={[large ? type.bodyBold : type.labelStrong, { color: fg }]} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}
