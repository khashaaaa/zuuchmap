import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Shown when nothing is selected, and as the sheet title. */
  placeholder: string;
  label?: string;
  disabled?: boolean;
}

/** A field that opens a picker sheet; never the platform's native select. */
export function Select({ options, value, onChange, placeholder, label, disabled }: SelectProps) {
  const { colors, type, radius, elevation } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[type.label, { color: disabled ? colors.textDisabled : colors.textPrimary }]}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${current?.label ?? placeholder}` : (current?.label ?? placeholder)}
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        style={{
          height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
          backgroundColor: disabled ? colors.bgSurfaceSunken : colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radius.input,
        }}
      >
        <Text
          numberOfLines={1}
          style={[type.body, { flex: 1, color: disabled ? colors.textDisabled : current ? colors.textPrimary : colors.textTertiary }]}
        >
          {current?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={20} color={disabled ? colors.textDisabled : colors.iconSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgScrim }}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View
            style={[
              elevation.lg,
              {
                backgroundColor: colors.bgSurface, borderTopLeftRadius: radius.modal, borderTopRightRadius: radius.modal,
                maxHeight: '70%', paddingBottom: insets.bottom + 8,
              },
            ]}
          >
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 12 }}>
              <View style={{ width: 40, height: 5, borderRadius: 9999, backgroundColor: colors.borderStrong }} />
            </View>
            <Text style={[type.title, { color: colors.textPrimary, paddingHorizontal: 20, paddingBottom: 8 }]}>{label ?? placeholder}</Text>
            <ScrollView>
              {options.map((o) => {
                const selected = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }}
                  >
                    <Text style={[selected ? type.bodyBold : type.body, { flex: 1, color: colors.textPrimary }]}>{o.label}</Text>
                    {selected ? <Icon name="check" size={20} color={colors.iconPrimary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
