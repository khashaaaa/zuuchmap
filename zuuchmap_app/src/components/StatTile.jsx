import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useCountUp } from '../hooks/useCountUp';

/**
 * The one way a stat is rendered: overline eyebrow above a tabular number.
 * Numeric values count up on first load (useCountUp handles reduced motion);
 * string values (dates, ranges) render as-is. `emphasis` paints the number
 * amber — reserve it for the single most important metric on a surface so
 * amber keeps its meaning.
 */
const StatTile = ({ label, value, icon, emphasis = false, ready = true, loading = false, style }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const isNumeric = typeof value === 'number' || (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)));
    const counted = useCountUp(isNumeric ? Number(value) : 0, ready && isNumeric);
    const display = isNumeric ? counted.toLocaleString() : (value ?? '—');

    return (
        <View style={[styles.tile, style]}>
            <View style={styles.labelRow}>
                {icon && <Ionicons name={icon} size={12} color={colors.text.tertiary} />}
                <Text style={styles.label} numberOfLines={1}>{label}</Text>
            </View>
            {loading
                ? <ActivityIndicator size="small" color={colors.iconAccent} />
                : (
                    <Text
                        style={[styles.value, emphasis && { color: colors.text.link }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {display}
                    </Text>
                )}
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    tile: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 56,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        marginBottom: spacing.xs,
    },
    label: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        color: colors.text.tertiary,
        textAlign: 'center',
    },
    value: {
        ...typography.styles.h1,
        color: colors.text.primary,
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
    },
});

export default StatTile;
