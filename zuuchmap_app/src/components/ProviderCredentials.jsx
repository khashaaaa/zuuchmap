import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import bookingService from '../services/api/bookingService';

/** "<1h", "3h", "2d" — the shape a reader compares providers by. */
// Returns null when there is nothing to say, so the caller drops the chip.
// MIRRORS zuuchmap_web/src/components/ProviderCredentials.jsx — including the
// 48-hour cutover: the two used to disagree (24h here), so the same provider
// read "~36 цагт" on the web and "2d" in the app. The strings were hardcoded
// English abbreviations, which rendered "18h дотор хариулдаг" in Mongolian.
export const humanizeResponse = (hours, t) => {
    if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return null;
    const h = Number(hours);
    if (h < 1) return t('review.statsUnderHour');
    if (h < 48) return t('review.statsHours', { count: Math.round(h) });
    return t('review.statsDays', { count: Math.round(h / 24) });
};

const Chip = ({ icon, text, tone, styles, colors }) => (
    <View style={[styles.chip, tone === 'success' && styles.chipSuccess]}>
        <Ionicons name={icon} size={13} color={tone === 'success' ? colors.success : colors.iconAccent} />
        <Text style={[styles.chipText, tone === 'success' && { color: colors.success }]} numberOfLines={1}>{text}</Text>
    </View>
);

/**
 * The provider's track record as one scannable row of chips, sitting between
 * the listing and the phone number: is the company verified, how fast do they
 * answer, how many jobs have they finished, how long have they been here.
 *
 * Shares the `['reviews', providerId]` query with ReviewSection — one request
 * feeds both; this component never fetches on its own key.
 */
const ProviderCredentials = ({ providerId, style }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const { data } = useQuery({
        queryKey: ['reviews', providerId],
        queryFn: () => bookingService.providerReviews(providerId),
        enabled: Boolean(providerId),
        staleTime: 60 * 1000,
    });

    const stats = data?.stats;
    if (!data || !stats) return null;

    const response = humanizeResponse(stats.avg_response_hours, t);
    const year = stats.member_since ? new Date(stats.member_since).getFullYear() : null;
    // No rating chip: the reviews block directly below owns that number, and
    // printing "4.4 · 8 үнэлгээ" twice on one screen said nothing the second
    // time. This strip carries the signals reviews do not.
    const chips = [];
    if (stats.company_verified) chips.push({ icon: 'shield-checkmark', text: t('review.statsVerified'), tone: 'success' });
    if (response) chips.push({ icon: 'flash-outline', text: t('review.statsResponse', { time: response }) });
    if (stats.completed_bookings > 0) chips.push({ icon: 'checkmark-done-outline', text: t('review.statsCompleted', { count: stats.completed_bookings }) });
    if (year && !Number.isNaN(year)) chips.push({ icon: 'calendar-outline', text: t('review.statsMemberSince', { year }) });
    if (chips.length === 0) return null;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={style}
            contentContainerStyle={styles.row}
            accessibilityLabel={chips.map((c) => c.text).join(', ')}
        >
            {chips.map((c) => <Chip key={c.icon} {...c} styles={styles} colors={colors} />)}
        </ScrollView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border.light,
    },
    chipSuccess: { backgroundColor: colors.opacity.background.success, borderColor: colors.opacity.border.success },
    chipText: { ...typography.styles.label, color: colors.text.primary },
});

export default React.memo(ProviderCredentials);
