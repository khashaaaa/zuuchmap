import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import Button from '../../components/Button';
import { EmptyState, SkeletonItem, FadeSlideIn, PressableScale } from '../../components';
import ScreenError from '../../components/ScreenError';
import bookingService from '../../services/api/bookingService';
import { showErrorModal, showWarningModal, getErrorMessage } from '../../utils/errorManager';
import { formatDateYYYYMMDD } from '../../utils/displayUtils';

const STATUS_COLORS = (colors) => ({
    PENDING: colors.warning,
    ACCEPTED: colors.success,
    DECLINED: colors.danger,
    CANCELLED: colors.text.tertiary,
});

// One screen for both sides: role 'customer' shows own requests, 'provider' shows received ones
const BookingListScreen = ({ route, navigation }) => {
    const { role = 'customer' } = route.params ?? {};
    const isProviderView = role === 'provider';
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [busyId, setBusyId] = useState(null);

    const { data: bookings = [], isLoading, isRefetching, isError, refetch } = useQuery({
        queryKey: ['bookings', role],
        queryFn: () => (isProviderView ? bookingService.received() : bookingService.mine()),
        staleTime: 30 * 1000,
    });

    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const actionMut = useMutation({
        mutationFn: ({ action, id }) => {
            if (action === 'accept') return bookingService.accept(id);
            if (action === 'decline') return bookingService.decline(id);
            return bookingService.cancel(id);
        },
        onMutate: ({ id }) => setBusyId(id),
        onSettled: () => setBusyId(null),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
        onError: (e) => showErrorModal(t('common.error'), getErrorMessage(e) || t('common.error')),
    });

    const confirmDecline = useCallback((id) => {
        showWarningModal(t('booking.declineConfirmTitle'), t('booking.declineConfirmMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('booking.decline'), style: 'destructive', onPress: () => actionMut.mutate({ action: 'decline', id }) },
        ]);
    }, [t, actionMut]);

    const confirmCancel = useCallback((id) => {
        showWarningModal(t('booking.cancelConfirmTitle'), t('booking.cancelConfirmMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('booking.cancel'), style: 'destructive', onPress: () => actionMut.mutate({ action: 'cancel', id }) },
        ]);
    }, [t, actionMut]);

    const renderItem = ({ item, index }) => {
        const other = isProviderView ? item.customer : item.provider;
        const statusColor = STATUS_COLORS(colors)[item.status] ?? colors.text.tertiary;
        const isPending = item.status === 'PENDING';
        const canCancel = !isProviderView && (item.status === 'PENDING' || item.status === 'ACCEPTED');
        const busy = busyId === item.id;

        return (
            <FadeSlideIn index={index}>
            <PressableScale
                style={styles.card}
                onPress={() => item.post && navigation.navigate('PostDetailScreen', {
                    postId: item.post.id, postType: item.post.category, role: isProviderView ? 'provider' : 'customer',
                })}
            >
                <View style={styles.cardHead}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.post?.title || t(`category.${item.post?.category}`, { defaultValue: item.post?.category })}
                    </Text>
                    <View style={[styles.statusChip, { borderColor: statusColor + '55', backgroundColor: statusColor + '18' }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>
                            {t(`booking.${item.status.toLowerCase()}`, { defaultValue: item.status })}
                        </Text>
                    </View>
                </View>

                <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={14} color={colors.text.tertiary} />
                    <Text style={styles.metaText}>
                        {formatDateYYYYMMDD(item.start_date)} — {formatDateYYYYMMDD(item.end_date)}
                    </Text>
                </View>

                <View style={styles.metaRow}>
                    <Ionicons name="person-outline" size={14} color={colors.text.tertiary} />
                    <Text style={styles.metaText}>{other?.given_name || '—'}</Text>
                    {other?.phone_number ? (
                        <Text style={[styles.metaText, { color: colors.primary }]}>{other.phone_number}</Text>
                    ) : null}
                </View>

                {item.message ? <Text style={styles.message} numberOfLines={2}>{item.message}</Text> : null}
                {item.response_message ? (
                    <Text style={styles.message} numberOfLines={2}>
                        {t('booking.responseMessage')}: {item.response_message}
                    </Text>
                ) : null}

                {isProviderView && isPending && (
                    <View style={styles.actions}>
                        <Button
                            title={t('booking.accept')}
                            size="small"
                            variant="success"
                            disabled={busy}
                            loading={busy}
                            onPress={() => actionMut.mutate({ action: 'accept', id: item.id })}
                            style={styles.actionBtn}
                        />
                        <Button
                            title={t('booking.decline')}
                            size="small"
                            variant="danger"
                            disabled={busy}
                            loading={busy}
                            onPress={() => confirmDecline(item.id)}
                            style={styles.actionBtn}
                        />
                    </View>
                )}
                {canCancel && (
                    <View style={styles.actions}>
                        <Button
                            title={t('booking.cancel')}
                            size="small"
                            variant="secondary"
                            disabled={busy}
                            loading={busy}
                            onPress={() => confirmCancel(item.id)}
                            style={styles.actionBtn}
                        />
                    </View>
                )}
            </PressableScale>
            </FadeSlideIn>
        );
    };

    const showSkeleton = useMinDisplayTime(isLoading);

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader
                title={t(isProviderView ? 'booking.receivedBookings' : 'booking.myBookings')}
                onBack={() => navigation.goBack()}
            />
            {showSkeleton ? (
                <FlatList
                    data={Array(5).fill({})}
                    renderItem={() => <SkeletonItem />}
                    keyExtractor={(_, i) => `sk-${i}`}
                    contentContainerStyle={styles.list}
                />
            ) : isError ? (
                <ScreenError onRetry={refetch} />
            ) : bookings.length === 0 ? (
                <EmptyState
                    icon="calendar-outline"
                    iconSize={64}
                    title={t('booking.empty')}
                    actionButton={!isProviderView ? {
                        icon: 'search',
                        text: t('posts.browse'),
                        onPress: () => navigation.navigate('CustomerDashboard', { screen: 'AllPosts' }),
                    } : undefined}
                />
            ) : (
                <FlatList
                    data={bookings}
                    renderItem={renderItem}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxxxl }]}
                    refreshControl={
                        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} colors={[colors.primary]} />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    list: { padding: spacing.lg, ...(isTablet ? { maxWidth: 680, alignSelf: 'center', width: '100%' } : {}) },
    card: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.lg,
        marginBottom: spacing.md,
        gap: spacing.sm,
    },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    cardTitle: { ...typography.styles.title, flex: 1, color: colors.text.primary },
    statusChip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, borderWidth: 1 },
    statusText: { ...typography.styles.badge },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    metaText: { ...typography.styles.caption, color: colors.text.secondary },
    message: { ...typography.styles.caption, color: colors.text.tertiary, backgroundColor: colors.background, borderRadius: radius.card, padding: spacing.md },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
    actionBtn: { flex: 1 },
});

export default BookingListScreen;
