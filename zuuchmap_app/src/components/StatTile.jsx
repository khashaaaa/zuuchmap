import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { groupThousands } from '../utils/displayUtils';

/**
 * The one way a stat is rendered: overline eyebrow above a tabular number.
 * Numeric values are grouped with toLocaleString; string values (dates,
 * ranges) render as-is. `emphasis` paints the number
 * amber — reserve it for the single most important metric on a surface so
 * amber keeps its meaning.
 */
const StatTile = ({ label, value, icon, emphasis = false, ready = true, loading = false, style }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    // A *string* only counts as numeric when it is plain digits. `Number()`
    // happily parses a date like "2026.09" and then groups it into "2,026.09",
    // which is how the member-since tile started reporting a thousands-separated
    // year. Every string stat here is a count; anything with a separator in it
    // is a date or a range, and the comment above already promised to leave
    // those alone. Real numbers still take the numeric path.
    const isNumeric = typeof value === 'number'
        || (typeof value === 'string' && /^-?\d+$/.test(value.trim()));
    const display = isNumeric ? groupThousands(Number(value)) : (value ?? '—');

    return (
        <View style={[styles.tile, style]}>
            {/* The icon is a glyph inside the label, not a sibling beside it. As a
                sibling it was centred against the whole text box: when the label
                wrapped, the box stayed full-width and the icon was left stranded
                at its far edge, half a line below the first line. */}
            <Text style={styles.label} numberOfLines={2}>
                {icon && <Ionicons name={icon} size={12} color={colors.text.tertiary} />}
                {icon ? ' ' : ''}{label}
            </Text>
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
    // Everything sits on the bottom edge: the numbers share a baseline and
    // each label ends directly above its number. When one label in a row wraps
    // ("ГИШҮҮН БОЛСОН" in a three-up row at 360dp) it grows upward, instead of
    // leaving its one-line neighbours stranded a line above their numbers.
    tile: {
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    label: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        color: colors.text.tertiary,
        textAlign: 'center',
        alignSelf: 'stretch',
        paddingHorizontal: spacing.xxs,
        marginBottom: spacing.xs,
    },
    value: {
        ...typography.styles.h1,
        color: colors.text.primary,
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
    },
});

export default StatTile;
