import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: (v: string) => void;
  placeholder?: string;
  forceFocused?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  inputRef?: { current: TextInput | null };
}

/** Standard search bar. The desktop Hero variant is not built here. */
export function SearchBar({ value, onChangeText, onSubmit, placeholder, forceFocused, onFocus, onBlur, inputRef }: SearchBarProps) {
  const { colors, type, radius } = useAppTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const on = focused || !!forceFocused;
  const bw = on ? 2 : 1;
  const { lineHeight: _lh, ...inputType } = type.body;
  void _lh;
  return (
    <View
      style={{
        height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 - bw,
        backgroundColor: colors.bgSurface, borderWidth: bw, borderColor: on ? colors.borderFocus : colors.borderDefault, borderRadius: radius.input,
      }}
    >
      <Icon name="search" size={20} color={colors.iconSecondary} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onSubmitEditing={() => onSubmit?.(value)}
        returnKeyType="search"
        placeholder={placeholder ?? t('kit.searchPlaceholder')}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.borderFocus}
        cursorColor={colors.borderFocus}
        accessibilityLabel={placeholder ?? t('kit.searchPlaceholder')}
        style={[inputType, { flex: 1, padding: 0, color: colors.textPrimary }]}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={15}
          accessibilityRole="button"
          accessibilityLabel={t('ui.clearSearch')}
        >
          <Icon name="x" size={18} color={colors.iconSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
