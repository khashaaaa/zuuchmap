import React, { useState, forwardRef } from 'react';
import { TextInput as RNTextInput, View, Text, StyleSheet } from 'react-native';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

// Dynamic type cap for form chrome: labels, inputs and helper lines still
// scale, but stop before a 200% setting wraps a single-line input onto three.
export const MAX_FONT_SCALE = 1.3;

// Thousand separators for the currency variant. Hand-rolled rather than
// toLocaleString: Hermes on Android ships without full ICU, so 'mn-MN' would
// silently fall back and the grouping would differ from iOS.
export const groupThousands = (digits) => String(digits ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Keep only ASCII digits. A Cyrillic keyboard can hand back full-width or
// locale digits and separators; the raw value in form state is always plain.
export const stripToDigits = (s) => String(s ?? '').replace(/[^0-9]/g, '');

const TextInput = forwardRef(function TextInput(
    {
        label,
        value,
        onChangeText,
        error,
        required = false,
        multiline = false,
        numberOfLines = 1,
        secureTextEntry = false,
        keyboardType = 'default',
        autoCapitalize,
        editable = true,
        placeholder,
        onFocus: onFocusProp,
        onBlur: onBlurProp,
        style,
        containerStyle,
        /**
         * 'currency' — displays the value with thousand separators and a
         * trailing ₮, forces the numeric keyboard, and hands `onChangeText`
         * the raw digit string so form state never holds formatting.
         */
        format,
        hint,
        ...props
    },
    ref
) {
    const { colors } = useAppTheme();
    const [isFocused, setIsFocused] = useState(false);

    const isCurrency = format === 'currency';
    const resolvedKeyboardType = isCurrency ? 'numeric' : keyboardType;
    const resolvedAutoCapitalize =
        autoCapitalize ?? (resolvedKeyboardType === 'email-address' || resolvedKeyboardType === 'url' ? 'none' : 'sentences');

    const displayValue = isCurrency ? groupThousands(stripToDigits(value)) : value;
    const handleChange = (text) => {
        if (!isCurrency) return onChangeText?.(text);
        const raw = stripToDigits(text).replace(/^0+(?=\d)/, '');
        onChangeText?.(raw);
    };

    const handleFocus = () => {
        setIsFocused(true);
        onFocusProp?.();
    };

    const handleBlur = () => {
        setIsFocused(false);
        onBlurProp?.();
    };

    const borderColor = error
        ? colors.danger
        : isFocused
        ? colors.primary
        : colors.border.light;

    const borderWidth = error || isFocused ? 2 : 1;

    return (
        <View style={[styles.group, containerStyle]}>
            {label !== undefined && (
                <View style={styles.labelRow}>
                    <Text style={[styles.label, { color: colors.text.secondary }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
                    {required && <Text style={[styles.star, { color: colors.danger }]} maxFontSizeMultiplier={MAX_FONT_SCALE}> *</Text>}
                </View>
            )}
            <View>
                <RNTextInput
                    ref={ref}
                    style={[
                        styles.input,
                        {
                            backgroundColor: colors.background,
                            color: colors.text.primary,
                            borderColor,
                            borderWidth,
                        },
                        multiline && styles.textarea,
                        isCurrency && styles.currencyInput,
                        !editable && styles.disabled,
                        style,
                    ]}
                    value={displayValue}
                    onChangeText={handleChange}
                    multiline={multiline}
                    numberOfLines={multiline ? numberOfLines : undefined}
                    textAlignVertical={multiline ? 'top' : 'auto'}
                    secureTextEntry={secureTextEntry}
                    keyboardType={resolvedKeyboardType}
                    autoCapitalize={resolvedAutoCapitalize}
                    editable={editable}
                    placeholder={placeholder}
                    placeholderTextColor={colors.text.placeholder}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    {...props}
                />
                {isCurrency && (
                    <Text
                        pointerEvents="none"
                        style={[styles.suffix, { color: displayValue ? colors.text.primary : colors.text.placeholder }]}
                        maxFontSizeMultiplier={MAX_FONT_SCALE}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                    >
                        ₮
                    </Text>
                )}
            </View>
            {!!hint && !error && (
                <Text style={[styles.hint, { color: colors.text.tertiary }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{hint}</Text>
            )}
            {!!error && (
                <Text style={[styles.error, { color: colors.danger }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{error}</Text>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    group: {
        marginBottom: spacing.lg,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    label: {
        ...typography.styles.label,
    },
    star: {
        ...typography.styles.labelStrong,
    },
    input: {
        borderWidth: 1,
        borderRadius: radius.input,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        ...typography.styles.body,
        // Android bottom-aligns single-line TextInput text when lineHeight is
        // set — drop the role's lineHeight here, restore it for multiline.
        lineHeight: undefined,
        minHeight: 52,
    },
    textarea: {
        minHeight: 100,
        paddingTop: spacing.md,
        lineHeight: typography.styles.body.lineHeight,
    },
    currencyInput: {
        ...typography.styles.price,
        lineHeight: undefined,
        fontVariant: ['tabular-nums'],
        paddingRight: spacing.xl + spacing.md,
    },
    suffix: {
        ...typography.styles.price,
        lineHeight: undefined,
        position: 'absolute',
        right: spacing.md,
        top: 0,
        bottom: 0,
        textAlignVertical: 'center',
        // iOS ignores textAlignVertical; centre via line box instead.
        paddingTop: (52 - typography.styles.price.fontSize * 1.2) / 2,
    },
    disabled: {
        opacity: 0.5,
    },
    hint: {
        ...typography.styles.micro,
        marginTop: spacing.xs,
        marginLeft: spacing.xs,
    },
    error: {
        ...typography.styles.micro,
        marginTop: spacing.xs,
        marginLeft: spacing.xs,
    },
});

export default TextInput;
