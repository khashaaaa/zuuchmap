import { useState } from 'react';
import { Text, TextInput, View, type InputModeOptions, type KeyboardTypeOptions } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';
import { notifyInputFocus } from './KeyboardAvoider';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  helper?: string;
  /** Externally supplied error (e.g. from the server). */
  error?: string | null;
  /** Runs on blur, not on every keystroke. Return a message or null. */
  validate?: (value: string) => string | null;
  icon?: string;
  inputMode?: InputModeOptions;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  disabled?: boolean;
  /** A taller, wrapping field for a comment or a message. */
  multiline?: boolean;
  maxLength?: number;
  /** Gallery only: render the Focused state. */
  forceFocused?: boolean;
}

export function TextField({
  label, value, onChangeText, placeholder, helper, error, validate, icon, inputMode, keyboardType, secureTextEntry, disabled, multiline, maxLength, forceFocused,
}: TextFieldProps) {
  const { colors, type, radius } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [blurError, setBlurError] = useState<string | null>(null);
  const shownError = error ?? blurError;
  const isFocused = focused || !!forceFocused;
  const bw = shownError || isFocused ? 2 : 1;
  const borderColor = shownError ? colors.statusDanger : isFocused ? colors.borderFocus : colors.borderDefault;
  const textColor = disabled ? colors.textDisabled : colors.textPrimary;
  const { lineHeight: _lh, ...inputType } = type.body;
  void _lh;

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: disabled ? colors.textDisabled : colors.textPrimary }]}>{label}</Text>
      <View
        style={{
          flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 10, paddingHorizontal: 16 - bw,
          ...(multiline ? { minHeight: 104, paddingVertical: 12 - bw } : { height: 48 }),
          backgroundColor: disabled ? colors.bgSurfaceSunken : colors.bgSurface, borderWidth: bw, borderColor, borderRadius: radius.input,
        }}
      >
        {icon ? <Icon name={icon} size={20} color={disabled ? colors.textDisabled : colors.iconSecondary} /> : null}
        <TextInput
          value={value}
          onChangeText={(v) => {
            onChangeText(v);
            if (blurError) setBlurError(null);
          }}
          onFocus={() => {
            setFocused(true);
            notifyInputFocus();
          }}
          onBlur={() => {
            setFocused(false);
            if (validate) setBlurError(validate(value));
          }}
          placeholder={placeholder}
          placeholderTextColor={disabled ? colors.textDisabled : colors.textTertiary}
          editable={!disabled}
          inputMode={inputMode}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          maxLength={maxLength}
          selectionColor={colors.borderFocus}
          cursorColor={colors.borderFocus}
          accessibilityLabel={label}
          accessibilityHint={shownError ?? helper}
          style={[inputType, { flex: 1, padding: 0, color: textColor }, multiline ? { minHeight: 80, textAlignVertical: 'top' as const } : null]}
        />
      </View>
      {shownError ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="circle-alert" size={16} color={colors.statusDanger} />
          <Text style={[type.small, { color: colors.statusDanger, flex: 1 }]}>{shownError}</Text>
        </View>
      ) : helper ? (
        <Text style={[type.small, { color: disabled ? colors.textDisabled : colors.textSecondary }]}>{helper}</Text>
      ) : null}
    </View>
  );
}
