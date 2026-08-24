import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Progress rail for the post-creation wizard.
 *
 * Publishing spans four screens (category → subcategory → location → details).
 * Without this the provider had no idea how much was left, and the sequence read
 * as an open-ended series of prompts rather than a form with an end.
 *
 * `labels` are already-translated strings; `current` is 1-based.
 */
const WizardSteps = ({ labels = [], current = 1 }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View
            style={styles.container}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: labels.length, now: current }}
        >
            {labels.map((label, i) => {
                const step = i + 1;
                const done = step < current;
                const active = step === current;
                return (
                    <View key={label} style={styles.step}>
                        <View
                            style={[
                                styles.bar,
                                { backgroundColor: done || active ? colors.primary : colors.border.light },
                            ]}
                        />
                        <Text
                            numberOfLines={1}
                            style={[
                                styles.label,
                                { color: active ? colors.text.primary : colors.text.tertiary },
                                active && typography.styles.labelStrong,
                            ]}
                        >
                            {label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
        backgroundColor: colors.surface,
    },
    step: { flex: 1, gap: spacing.xs },
    bar: { height: 3, borderRadius: radius.pill },
    label: { ...typography.styles.micro },
});

export default React.memo(WizardSteps);
