import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ScreenLayout, StatTile, SkeletonItem, SelectionPop } from '../../components';
import adminService from '../../services/api/adminService';
import { useCategorySchemas } from '../../hooks/useCategorySchemas';
import { getSchemaLabel } from '../../utils/postUtils';

export const ADMIN_ANALYTICS_KEY = ['admin', 'analytics'];

// Matches the web's ranges. The server clamps to 1–365 regardless.
const RANGES = [7, 30, 90];
const TOP_N = 8;

const FUNNEL_STAGES = [
    ['visited', 'analytics.stageVisited'],
    ['searched', 'analytics.stageSearched'],
    ['viewed_post', 'analytics.stageViewedPost'],
    ['started_auth', 'analytics.stageStartedAuth'],
    ['verified', 'analytics.stageVerified'],
    ['submitted_post', 'analytics.stageSubmittedPost'],
    ['requested_booking', 'analytics.stageRequestedBooking'],
];

/**
 * The analytics summary — the app counterpart of the web's AdminAnalytics.
 *
 * Deliberately not the whole web page. Daily time-series charts do not survive
 * the trip to a 390px screen, so what comes across is what an admin actually
 * needs away from a desk: the totals, where the funnel leaks, which categories
 * carry the listings, and the demand gaps — searches that returned nothing,
 * which is the one table here that names a decision rather than describing the
 * past.
 */
const AdminAnalytics = () => {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t, i18n } = useTranslation();
    const [days, setDays] = useState(30);
    // Returns the array itself, not a query object — destructuring `data`
    // off it yields undefined and every label silently falls back to the raw key.
    const schemas = useCategorySchemas();

    const { data, isLoading, isRefetching, isError, refetch } = useQuery({
        queryKey: [...ADMIN_ANALYTICS_KEY, days],
        queryFn: () => adminService.summary(days),
        staleTime: 5 * 60 * 1000,
    });
    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const totals = data?.totals ?? {};
    const funnel = data?.funnel ?? {};

    // Category keys come back raw; the label is schema-driven and localized, so
    // never hardcode a category name here.
    const categoryLabel = useCallback((key) => {
        const schema = schemas.find((s) => s.key === key);
        return schema ? getSchemaLabel(schema) : key;
    // i18n.language: labels must recompute when the locale switches.
    }, [schemas, i18n.language]);

    const categories = (data?.breakdowns?.categories ?? []).slice(0, TOP_N);
    const gaps = (data?.search_gaps ?? []).slice(0, TOP_N);
    const maxCategoryPosts = Math.max(1, ...categories.map((c) => c.posts || 0));

    return (
        <ScreenLayout title={t('analytics.title')} error={isError} onRetry={refetch}>
            <View style={styles.tabs} accessibilityRole="tablist">
                {RANGES.map((value) => (
                    <SelectionPop key={value} selected={days === value}>
                        <TouchableOpacity
                            style={[
                                styles.tab,
                                { borderColor: colors.border.light },
                                days === value && { borderColor: colors.primary, backgroundColor: colors.opacity.background.primary },
                            ]}
                            onPress={() => setDays(value)}
                            activeOpacity={interactions.activeOpacity}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: days === value }}
                        >
                            <Text style={[styles.tabText, { color: days === value ? colors.text.link : colors.text.secondary }]}>
                                {t('analytics.days', { count: value })}
                            </Text>
                        </TouchableOpacity>
                    </SelectionPop>
                ))}
            </View>

            {isLoading ? (
                <View style={styles.body}>
                    {[0, 1, 2].map((i) => <SkeletonItem key={i} style={{ marginBottom: spacing.md }} />)}
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.iconAccent} />}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.tileGrid}>
                        <StatTile style={styles.tile} label={t('analytics.users')} value={totals.users ?? 0} icon="people-outline" />
                        <StatTile style={styles.tile} label={t('analytics.providers')} value={totals.providers ?? 0} icon="business-outline" />
                        <StatTile style={styles.tile} label={t('analytics.customers')} value={totals.customers ?? 0} icon="person-outline" />
                        <StatTile style={styles.tile} label={t('analytics.liveListings')} value={totals.approved_posts ?? 0} icon="documents-outline" emphasis />
                        <StatTile style={styles.tile} label={t('analytics.pendingQueue')} value={totals.pending_posts ?? 0} icon="hourglass-outline" />
                        <StatTile style={styles.tile} label={t('analytics.views')} value={totals.post_views ?? 0} icon="eye-outline" />
                        <StatTile style={styles.tile} label={t('analytics.acceptedBookings')} value={totals.accepted_bookings ?? 0} icon="calendar-outline" />
                    </View>

                    <Section styles={styles} title={t('analytics.funnelTitle')} hint={t('analytics.funnelHint')}>
                        {FUNNEL_STAGES.map(([key, labelKey]) => {
                            const value = funnel[key] ?? 0;
                            // Each stage as a share of the widest one, so the
                            // drop-off is visible without a chart library.
                            const share = funnel.visited ? Math.round((value / funnel.visited) * 100) : 0;
                            return (
                                <View key={key} style={styles.barRow}>
                                    <Text style={styles.barLabel} numberOfLines={1}>{t(labelKey)}</Text>
                                    <View style={styles.barTrack}>
                                        <View style={[styles.barFill, { width: `${Math.max(share, value > 0 ? 2 : 0)}%` }]} />
                                    </View>
                                    <Text style={styles.barValue}>{value.toLocaleString()}</Text>
                                </View>
                            );
                        })}
                    </Section>

                    <Section styles={styles} title={t('analytics.byCategory')} hint={t('analytics.byCategoryHint')}>
                        {categories.length === 0 ? (
                            <Text style={styles.muted}>{t('analytics.noData')}</Text>
                        ) : categories.map((row) => (
                            <View key={row.key} style={styles.barRow}>
                                <Text style={styles.barLabel} numberOfLines={1}>{categoryLabel(row.key)}</Text>
                                <View style={styles.barTrack}>
                                    <View style={[styles.barFill, { width: `${Math.round((row.posts / maxCategoryPosts) * 100)}%` }]} />
                                </View>
                                <Text style={styles.barValue}>{Number(row.posts).toLocaleString()}</Text>
                            </View>
                        ))}
                    </Section>

                    <Section styles={styles} title={t('analytics.searchGaps')} hint={t('analytics.searchGapsHint')}>
                        {gaps.length === 0 ? (
                            <Text style={styles.muted}>{t('analytics.noData')}</Text>
                        ) : gaps.map((row, index) => (
                            <View key={`${row.q}-${row.category}-${row.province}-${index}`} style={styles.gapRow}>
                                <View style={styles.gapMain}>
                                    <Text style={styles.gapQuery} numberOfLines={1}>{row.q}</Text>
                                    <Text style={styles.muted} numberOfLines={1}>
                                        {row.category === 'all' ? t('analytics.allCategories') : categoryLabel(row.category)}
                                    </Text>
                                </View>
                                <View style={styles.gapMeta}>
                                    {/* Zero-result searches are the point of this
                                        table: demand with no supply behind it. */}
                                    <Text style={[styles.gapZero, row.zero_results > 0 && { color: colors.text.link }]}>
                                        {row.zero_results}
                                    </Text>
                                    <Text style={styles.muted}>{t('analytics.zeroResults')}</Text>
                                </View>
                            </View>
                        ))}
                    </Section>
                </ScrollView>
            )}
        </ScreenLayout>
    );
};

const Section = ({ styles, title, hint, children }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
        <View style={styles.sectionBody}>{children}</View>
    </View>
);

const createStyles = (colors) => StyleSheet.create({
    tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border.light },
    tab: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    tabText: { ...typography.styles.label, includeFontPadding: false },
    body: { padding: spacing.lg, maxWidth: isTablet ? 720 : undefined, alignSelf: isTablet ? 'center' : 'stretch', width: '100%' },
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    tile: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
    section: { marginBottom: spacing.xl },
    sectionTitle: { ...typography.styles.h3, color: colors.text.primary },
    sectionHint: { ...typography.styles.small, color: colors.text.tertiary, marginTop: 2, marginBottom: spacing.sm },
    sectionBody: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    barLabel: { ...typography.styles.caption, color: colors.text.secondary, width: '32%' },
    barTrack: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.border.light, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
    barValue: { ...typography.styles.caption, color: colors.text.primary, minWidth: 48, textAlign: 'right' },
    gapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    gapMain: { flex: 1, gap: 2 },
    gapQuery: { ...typography.styles.bodyMedium, color: colors.text.primary },
    gapMeta: { alignItems: 'flex-end' },
    gapZero: { ...typography.styles.title, color: colors.text.primary },
    muted: { ...typography.styles.small, color: colors.text.tertiary },
});

export default AdminAnalytics;
