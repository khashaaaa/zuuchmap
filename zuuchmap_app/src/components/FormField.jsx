import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

const FormField = ({ label, component, required = true, error }) => {
    const { colors, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>
                {label} {required && <Text style={gStyles.requiredStar}>*</Text>}
            </Text>
            {component}
            {error && (
                <Text style={gStyles.errorText}>{error}</Text>
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
});

export default FormField;
