import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

// Dynamic type cap for form chrome — matches TextInput so a label and its
// input scale in step and a 200% setting does not wrap labels onto three lines.
const MAX_FONT_SCALE = 1.3;

const FormField = ({ label, component, required = false, error, hint, style }) => {
    const { colors, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={[styles.inputContainer, style]}>
            <Text style={styles.inputLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {label} {required && <Text style={gStyles.requiredStar} maxFontSizeMultiplier={MAX_FONT_SCALE}>*</Text>}
            </Text>
            {component}
            {!!hint && !error && (
                <Text style={styles.hint} maxFontSizeMultiplier={MAX_FONT_SCALE}>{hint}</Text>
            )}
            {error && (
                <Text style={gStyles.errorText} maxFontSizeMultiplier={MAX_FONT_SCALE}>{error}</Text>
            )}
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    inputContainer: {
        marginBottom: spacing.xl,
    },
    inputLabel: {
        ...typography.styles.label,
        color: colors.text.primary,
        marginBottom: spacing.md,
    },
    hint: {
        ...typography.styles.micro,
        color: colors.text.tertiary,
        marginTop: spacing.xs,
    },
});

export default FormField;
