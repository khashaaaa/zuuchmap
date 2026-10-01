import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, withAlpha } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

const TERMINAL = { DECLINED: 'booking.declined', CANCELLED: 'booking.cancelled', EXPIRED: 'booking.expired' };

const DOT = 18;

/**
 * Derives the visible steps from a booking. Happy path is four stops
 * (requested → accepted → in progress → done) with the live stop found from
 * today against start/end. A refusal (declined/cancelled/expired) collapses
 * the path to "requested → <terminal>" — there is nothing further to reach.
 * Exported so a detail view can reuse the same reading of the status.
 */
export function deriveTimeline(status, startDate, endDate, now = new Date()) {
    if (TERMINAL[status]) {
        return { steps: ['booking.timelineRequested', TERMINAL[status]], active: 1, terminal: true };
    }
    const steps = ['booking.timelineRequested', 'booking.accepted', 'booking.timelineInProgress', 'booking.timelineDone'];
    if (status !== 'ACCEPTED') return { steps, active: 0, terminal: false };
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end && end < today) return { steps, active: 3, terminal: false };
    if (start && start <= today) return { steps, active: 2, terminal: false };
    return { steps, active: 1, terminal: false };
}

const BookingTimeline = ({ status, startDate, endDate, style }) => {
    const { colors, isDark } = useAppTheme();
    const { t } = useTranslation();
    const { steps, active, terminal } = useMemo(
        () => deriveTimeline(status, startDate, endDate),
        [status, startDate, endDate],
    );

    // Reached stops are quiet success; the live stop is the one amber thing on
    // the card; unreached stops are a hairline. A terminal stop is danger.
    const tone = (i) => {
        const isActive = i === active;
        const reached = i < active;
        if (terminal && isActive) {
            return {
                fill: colors.danger,
                ring: colors.danger,
                text: isDark ? colors.dangerLight : colors.dangerDark,
                icon: 'close',
            };
        }
        if (isActive) {
            return { fill: colors.primary, ring: colors.primary, text: colors.text.link, icon: null };
        }
        if (reached) {
            return { fill: colors.success, ring: colors.success, text: colors.text.secondary, icon: 'checkmark' };
        }
        return { fill: 'transparent', ring: colors.border.medium, text: colors.text.tertiary, icon: null };
    };

    return (
        <View
            style={[styles.row, style]}
            accessibilityRole="progressbar"
            accessibilityLabel={steps.map((k) => t(k)).join(' › ')}
            accessibilityValue={{ min: 0, max: steps.length - 1, now: active }}
        >
            {steps.map((key, i) => {
                const s = tone(i);
                const isLast = i === steps.length - 1;
                const isActive = i === active;
                // Track segment leading out of this stop is "done" only if the
                // next stop has been reached.
                const segmentDone = i < active;
                return (
                    <View key={key} style={[styles.step, isLast && styles.stepLast]}>
                        <View style={[styles.dotRow, isLast && styles.dotRowLast]}>
                            {/* The last stop is as wide as its label, so the
                                incoming track continues inside it up to the dot. */}
                            {isLast && i > 0 && (
                                <View style={[
                                    styles.track,
                                    styles.trackJoinLeft,
                                    { backgroundColor: i - 1 < active ? withAlpha(colors.success, 0.55) : colors.border.light },
                                ]} />
                            )}
                            <View style={[
                                styles.dot,
                                { backgroundColor: s.fill, borderColor: s.ring },
                                isActive && !terminal && { backgroundColor: colors.primary },
                                isActive && terminal && { backgroundColor: colors.danger },
                            ]}>
                                {s.icon ? (
                                    <Ionicons name={s.icon} size={11} color={colors.text.onColor} />
                                ) : isActive ? (
                                    <View style={[styles.dotCore, { backgroundColor: colors.onPrimary }]} />
                                ) : null}
                            </View>
                            {!isLast && (
                                <View style={[
                                    styles.track,
                                    i === steps.length - 2 && styles.trackJoinRight,
                                    { backgroundColor: segmentDone ? withAlpha(colors.success, 0.55) : colors.border.light },
                                ]} />
                            )}
                        </View>
                        <Text
                            style={[styles.label, { color: s.text }, isActive && styles.labelActive, isLast && styles.labelLast]}
                            numberOfLines={2}
                        >
                            {t(key)}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
    },
    step: {
        flex: 1,
    },
    stepLast: {
        // The last stop has no outgoing track; keep it from stretching so the
        // dots stay evenly spaced.
        flex: 0,
        minWidth: 56,
        maxWidth: '40%',
        // The dot sits on the card's right edge and its label ends under it.
        // Left-aligned, "Дууссан" hung out past the dot it names.
        alignItems: 'flex-end',
    },
    labelLast: { textAlign: 'right', paddingRight: 0 },
    dotRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dotRowLast: { alignSelf: 'stretch' },
    dot: {
        width: DOT,
        height: DOT,
        borderRadius: radius.pill,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dotCore: {
        width: 6,
        height: 6,
        borderRadius: radius.pill,
    },
    track: {
        flex: 1,
        height: 2,
        marginHorizontal: spacing.xxs,
        borderRadius: radius.pill,
    },
    // The segment into the last stop is drawn in two pieces; butt them together.
    trackJoinRight: { marginRight: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
    trackJoinLeft: { marginLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
    label: {
        ...typography.styles.micro,
        marginTop: spacing.xxs,
        // Bounded by the step, not by a fixed 72dp: with two stops on a card
        // "Хүсэлт илгээсэн" wrapped beside a track's worth of empty space.
        paddingRight: spacing.xs,
    },
    labelActive: {
        ...typography.styles.badge,
    },
});

export default BookingTimeline;
