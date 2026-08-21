import React, { useState, forwardRef } from 'react';
import { TextInput as RNTextInput, View, Text, StyleSheet } from 'react-native';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

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
        ...props
    },
    ref
) {
    const { colors } = useAppTheme();
    const [isFocused, setIsFocused] = useState(false);

    const resolvedAutoCapitalize =
        autoCapitalize ?? (keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences');

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
                    <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
                    {required && <Text style={[styles.star, { color: colors.danger }]}> *</Text>}
                </View>
            )}
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
                    !editable && styles.disabled,
                    style,
                ]}
                value={value}
                onChangeText={onChangeText}
                multiline={multiline}
                numberOfLines={multiline ? numberOfLines : undefined}
                textAlignVertical={multiline ? 'top' : 'auto'}
                secureTextEntry={secureTextEntry}
                keyboardType={keyboardType}
                autoCapitalize={resolvedAutoCapitalize}
                editable={editable}
                placeholder={placeholder}
                placeholderTextColor={colors.text.placeholder}
                onFocus={handleFocus}
                onBlur={handleBlur}
                {...props}
            />
            {!!error && (
                <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
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
        minHeight: 52,
    },
    textarea: {
        minHeight: 100,
        paddingTop: spacing.md,
    },
    disabled: {
        opacity: 0.5,
    },
    error: {
        ...typography.styles.micro,
        marginTop: spacing.xs,
        marginLeft: spacing.xs,
    },
});

export default TextInput;
