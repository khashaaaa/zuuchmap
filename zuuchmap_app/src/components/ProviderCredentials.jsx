import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import bookingService from '../services/api/bookingService';

/** "<1h", "3h", "2d" — the shape a reader compares providers by. */
export const humanizeResponse = (hours) => {
    if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return null;
    const h = Number(hours);
    if (h < 1) return '<1h';
    if (h < 24) return `${Math.round(h)}h`;
    return `${Math.round(h / 24)}d`;
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

    const response = humanizeResponse(stats.avg_response_hours);
    const year = stats.member_since ? new Date(stats.member_since).getFullYear() : null;
    const chips = [];
    if (stats.company_verified) chips.push({ icon: 'shield-checkmark', text: t('review.statsVerified'), tone: 'success' });
    if (data.count > 0) chips.push({ icon: 'star', text: `${Number(data.average).toFixed(1)} · ${t('review.count', { count: data.count })}` });
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
