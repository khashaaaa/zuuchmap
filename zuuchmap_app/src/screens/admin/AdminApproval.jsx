import React, { useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    StyleSheet,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, shadows, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import Button from '../../components/Button';
import postService from '../../services/api/postService';
import FadeSlideIn from '../../components/FadeSlideIn';
import { socketService } from '../../services/socketService';
import { invalidatePostData } from '../../services/queryClient';


const StatCard = ({ label, value, color, colors }) => (
    <View style={[styles.statCard, { borderColor: color + '44', backgroundColor: colors.surface }]}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: colors.text.tertiary }]}>{label}</Text>
    </View>
);

const AdminApproval = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const { t } = useTranslation();
    const { data: stats, isLoading: loading, isRefetching: refreshing, refetch } = useQuery({
        queryKey: ['admin', 'stats'],
        queryFn: async () => (await postService.getAdminStats()).data,
        staleTime: 30 * 1000,
    });

    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    useEffect(() => {
        const s = socketService.connect('admin');
        const handleDataChanged = () => invalidatePostData();

        s.on('stats.updated', handleDataChanged);
        s.on('post.created', handleDataChanged);

        return () => {
            socketService.off('stats.updated', handleDataChanged);
            socketService.off('post.created', handleDataChanged);
            socketService.disconnect();
        };
    }, []);

    const totalPending = stats?.totals?.pending ?? 0;

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('admin.dashboard')} showBack={false} />

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} size="large" />
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'ios' ? 88 : 65) + insets.bottom + spacing.md }]}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={refetch}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                >
                    <View style={styles.tabletCentering}>
                    <Text style={[styles.sectionTitle, { color: colors.text.tertiary }]}>{t('admin.pendingPosts')}</Text>
                    <View style={styles.totalsRow}>
                        <StatCard label={t('status.pending')} value={stats?.totals?.pending ?? 0} color={colors.warning} colors={colors} />
                        <StatCard label={t('status.approved')} value={stats?.totals?.approved ?? 0} color={colors.success} colors={colors} />
                        <StatCard label={t('status.rejected')} value={stats?.totals?.rejected ?? 0} color={colors.danger} colors={colors} />
                    </View>

                    <Button
                        icon="shield-checkmark-outline"
                        title={totalPending > 0 ? `${totalPending} ${t('posts.approve')}` : t('common.noData')}
                        onPress={() => navigation.navigate('AdminPostList')}
                        disabled={totalPending === 0}
                        fullWidth
                        style={{ marginBottom: spacing.lg, ...shadows.medium }}
                    />

                    <Text style={[styles.sectionTitle, { color: colors.text.tertiary }]}>{t('nav.categories')}</Text>
                    {stats?.byType?.map((row, i) => (
                        <FadeSlideIn key={row.postType} index={i} delay={100}>
                            <TouchableOpacity
                                style={[styles.typeRow, { backgroundColor: colors.surface }]}
                                onPress={() => navigation.navigate('AdminPostList', { filterType: row.postType })}
                                activeOpacity={interactions.activeOpacity}
                            >
                                <Text style={[styles.typeLabel, { color: colors.text.inverse }]}>{row.postType ? t(`category.${row.postType}`, { defaultValue: row.postType }) : ''}</Text>
                                <View style={styles.typeBadges}>
                                    {row.pending > 0 && (
                                        <View style={[styles.badgeWarning, { backgroundColor: colors.opacity.background.warning }]}>
                                            <Text style={[styles.badgeWarningText, { color: colors.warning }]}>{row.pending}</Text>
                                        </View>
                                    )}
                                    <View style={[styles.badgeSuccess, { backgroundColor: colors.opacity.background.success }]}>
                                        <Text style={[styles.badgeSuccessText, { color: colors.success }]}>{row.approved}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                                </View>
                            </TouchableOpacity>
                        </FadeSlideIn>
                    ))}
                    </View>{/* end tabletCentering */}
                </ScrollView>
            )}
        </CustomSafeAreaView>
    );
};

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: spacing.lg },
    tabletCentering: {
        maxWidth: isTablet ? 700 : '100%',
        alignSelf: 'center',
        width: '100%',
    },
    sectionTitle: {
        fontSize: typography.sm,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.md,
        marginTop: spacing.lg,
    },
    totalsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    statCard: {
        flex: 1,
        borderRadius: radius.card,
        borderWidth: 1,
        padding: spacing.md,
        alignItems: 'center',
        ...shadows.small,
    },
    statValue: { fontSize: typography.xxl, fontWeight: '700' },
    statLabel: { fontSize: typography.xs, marginTop: spacing.xs, textAlign: 'center' },
    typeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: radius.card,
        padding: spacing.md,
        marginBottom: spacing.sm,
        ...shadows.small,
    },
    typeLabel: { fontSize: typography.sm, fontWeight: '500' },
    typeBadges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    badgeWarning: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    badgeWarningText: { fontSize: typography.xs, fontWeight: '600' },
    badgeSuccess: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    badgeSuccessText: { fontSize: typography.xs, fontWeight: '600' },
});

export default AdminApproval;
