import React, { useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    ScrollView,
    RefreshControl,
    StyleSheet,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, radius, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import ScreenError from '../../components/ScreenError';
import ScreenLoading from '../../components/ScreenLoading';
import Button from '../../components/Button';
import PressableScale from '../../components/PressableScale';
import postService from '../../services/api/postService';
import FadeSlideIn from '../../components/FadeSlideIn';
import { socketService } from '../../services/socketService';
import { invalidatePostData } from '../../services/queryClient';


const StatCard = ({ label, value, color, colors }) => (
    <View style={[styles.statCard, colors.elevation.sm, { borderColor: color + '44', backgroundColor: colors.surface }]}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: colors.text.tertiary }]}>{label}</Text>
    </View>
);

const AdminApproval = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const { t } = useTranslation();
    const { data: stats, isLoading: loading, isRefetching: refreshing, isError, refetch } = useQuery({
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
            // Do not disconnect — the socket is shared with useNotificationSync;
            // its lifecycle ends at logout (userService.logout), not screen unmount.
        };
    }, []);

    const totalPending = stats?.totals?.pending ?? 0;

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('admin.dashboard')} showBack={false} />

            {loading ? (
                <ScreenLoading />
            ) : isError ? (
                <ScreenError onRetry={refetch} />
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
                        style={{ ...colors.elevation.md, marginBottom: spacing.lg }}
                    />

                    <Text style={[styles.sectionTitle, { color: colors.text.tertiary }]}>{t('nav.categories')}</Text>
                    {stats?.byType?.map((row, i) => (
                        <FadeSlideIn key={row.postType} index={i} delay={100}>
                            <PressableScale
                                style={[styles.typeRow, colors.elevation.sm, { backgroundColor: colors.surface }]}
                                onPress={() => navigation.navigate('AdminPostList', { filterType: row.postType })}
                                accessibilityRole="button"
                            >
                                <Text style={[styles.typeLabel, { color: colors.text.primary }]}>{row.postType ? t(`category.${row.postType}`, { defaultValue: row.postType }) : ''}</Text>
                                <View style={styles.typeBadges}>
                                    {row.pending > 0 && (
                                        <View style={[styles.badgeWarning, { backgroundColor: colors.opacity.background.warning }]}>
                                            <Text style={[styles.badgeWarningText, { color: colors.warning }]}>{row.pending}</Text>
                                        </View>
                                    )}
                                    <View style={[styles.badgeSuccess, { backgroundColor: colors.opacity.background.success }]}>
                                        <Text style={[styles.badgeSuccessText, { color: colors.success }]}>{row.approved}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                                </View>
                            </PressableScale>
                        </FadeSlideIn>
                    ))}
                    </View>{/* end tabletCentering */}
                </ScrollView>
            )}
        </CustomSafeAreaView>
    );
};

const styles = StyleSheet.create({
    content: { padding: spacing.lg },
    tabletCentering: {
        maxWidth: isTablet ? 700 : '100%',
        alignSelf: 'center',
        width: '100%',
    },
    sectionTitle: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
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
    },
    statValue: { ...typography.styles.h2 },
    statLabel: { ...typography.styles.small, marginTop: spacing.xs, textAlign: 'center' },
    typeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: radius.card,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    typeLabel: { ...typography.styles.label },
    typeBadges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    badgeWarning: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    badgeWarningText: { ...typography.styles.badge },
    badgeSuccess: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    badgeSuccessText: { ...typography.styles.badge },
});

export default AdminApproval;
