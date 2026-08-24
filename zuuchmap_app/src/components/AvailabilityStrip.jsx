import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, withAlpha } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

export const AVAILABILITY_DAYS = 14;

const toIsoDay = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/**
 * Fourteen dots, one per day from today, read from `busy_dates` (ISO days the
 * engine derives from ACCEPTED bookings). A rental card wants "can I have it
 * this week?" answered at a glance, before the tap — a strip does that where a
 * calendar would not fit.
 *
 * `size="sm"` is the list-card rung: dots plus a "9/14" figure. `size="md"`
 * adds the sentence and a legend for the detail screen. The whole strip is one
 * accessibility element that reads the summary sentence.
 */
const AvailabilityStrip = ({ busyDates, size = 'sm', style }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const days = useMemo(() => {
        const busy = new Set(Array.isArray(busyDates) ? busyDates.map((s) => String(s).slice(0, 10)) : []);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return Array.from({ length: AVAILABILITY_DAYS }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return { iso: toIsoDay(d), busy: busy.has(toIsoDay(d)), today: i === 0 };
        });
    }, [busyDates]);

    const free = days.filter((d) => !d.busy).length;
    const summary = t('posts.availabilityFree', { free, total: AVAILABILITY_DAYS });
    const large = size === 'md';
    const dot = large ? 14 : 8;

    return (
        <View
            style={[styles.wrap, style]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${t('posts.availabilityNext')}. ${summary}`}
        >
            <View style={styles.row}>
                <View style={[styles.dots, { gap: large ? spacing.xs + 1 : spacing.xxs + 1 }]}>
                    {days.map((d) => (
                        <View
                            key={d.iso}
                            style={[
                                styles.dot,
                                { width: dot, height: dot, borderRadius: dot / 2 },
                                d.busy ? styles.dotBusy : styles.dotFree,
                                d.today && [styles.dotToday, { width: dot + 2, height: dot + 2, borderRadius: (dot + 2) / 2 }],
                            ]}
                        />
                    ))}
                </View>
                {!large && (
                    <Text style={[styles.figure, free === 0 && { color: colors.danger }]}>
                        {free}/{AVAILABILITY_DAYS}
                    </Text>
                )}
            </View>
            {large && (
                <View style={styles.legendRow}>
                    <Text style={styles.summary}>{summary}</Text>
                    <View style={styles.legend}>
                        <View style={[styles.legendDot, styles.dotFree]} />
                        <Text style={styles.legendText}>{t('posts.availabilityFreeLabel')}</Text>
                        <View style={[styles.legendDot, styles.dotBusy, { marginLeft: spacing.sm }]} />
                        <Text style={styles.legendText}>{t('posts.availabilityBusy')}</Text>
                    </View>
                </View>
            )}
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    wrap: { gap: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dots: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flexWrap: 'nowrap' },
    dot: { borderWidth: 1 },
    dotFree: { backgroundColor: withAlpha(colors.success, 0.28), borderColor: colors.success },
    dotBusy: { backgroundColor: withAlpha(colors.danger, 0.28), borderColor: colors.danger },
    // Today: the one dot with a second ring, so the strip has a fixed origin.
    dotToday: { borderWidth: 2, borderColor: colors.text.primary },
    figure: { ...typography.styles.small, color: colors.text.secondary, fontVariant: ['tabular-nums'] },
    legendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
    summary: { ...typography.styles.label, color: colors.text.primary },
    legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    legendDot: { width: 8, height: 8, borderRadius: radius.full, borderWidth: 1 },
    legendText: { ...typography.styles.small, color: colors.text.tertiary },
});

export default React.memo(AvailabilityStrip);
