import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet, withAlpha, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import Button from '../../components/Button';
import { EmptyState, SkeletonItem, SkeletonCrossfade, FadeSlideIn, PressableScale, BookingTimeline } from '../../components';
import ScreenError from '../../components/ScreenError';
import bookingService from '../../services/api/bookingService';
import { showErrorModal, showWarningModal, getErrorMessage } from '../../utils/errorManager';
import { formatDate } from '../../utils/displayUtils';

// `fill` tints the chip and paints the card's left rule; `text` is the label.
// They differ because the fill hue set as its own label on a 10% tint of itself
// only reaches ~4.2:1 — under AA at the 12px badge size. The Light/Dark steps
// already in the palette are solved for exactly this.
const STATUS_COLORS = (colors, isDark) => ({
    PENDING: { fill: colors.warning, text: isDark ? colors.warningLight : colors.warningDark },
    ACCEPTED: { fill: colors.success, text: isDark ? colors.successLight : colors.successDark },
    DECLINED: { fill: colors.danger, text: isDark ? colors.dangerLight : colors.dangerDark },
    CANCELLED: { fill: colors.text.tertiary, text: colors.text.secondary },
    // Nobody acted and the dates ran out — as quiet as CANCELLED, because it is
    // nobody's refusal.
    EXPIRED: { fill: colors.text.tertiary, text: colors.text.secondary },
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
    const [busy, setBusy] = useState(null); // `${id}:${action}` while in flight

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
        onMutate: ({ id, action }) => setBusy(`${id}:${action}`),
        onSettled: () => setBusy(null),
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
        const status = STATUS_COLORS(colors, isDark)[item.status]
            ?? { fill: colors.text.tertiary, text: colors.text.secondary };
        const statusColor = status.fill;
        const isPending = item.status === 'PENDING';
        const canCancel = !isProviderView && (item.status === 'PENDING' || item.status === 'ACCEPTED');
        const busyAction = busy?.startsWith(`${item.id}:`) ? busy.split(':')[1] : null;
        const anyBusy = Boolean(busyAction);

        return (
            <FadeSlideIn index={index}>
            <PressableScale
                style={[
                    styles.card,
                    isProviderView && isPending && colors.elevation.md,
                    { borderLeftWidth: 3, borderLeftColor: statusColor },
                ]}
                onPress={() => item.post && navigation.navigate('PostDetailScreen', {
                    postId: item.post.id, postType: item.post.category, role: isProviderView ? 'provider' : 'customer',
                })}
            >
                <View style={styles.cardHead}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                        {!item.post
                            ? t('booking.postRemoved')
                            : item.post.title || t(`category.${item.post.category}`, { defaultValue: item.post.category })}
                    </Text>
                    {isPending && (
                        <View style={[styles.statusChip, { borderColor: withAlpha(statusColor, 0.33), backgroundColor: withAlpha(statusColor, 0.1) }]}>
                            <Text style={[styles.statusText, { color: status.text }]}>
                                {t('booking.pending')}
                            </Text>
                        </View>
                    )}
                </View>

                <BookingTimeline status={item.status} startDate={item.start_date} endDate={item.end_date} />

                <View style={styles.periodBlock}>
                    <Text style={styles.periodLabel}>{t('booking.period')}</Text>
                    <Text style={styles.periodText}>
                        {formatDate(item.start_date)} — {formatDate(item.end_date)}
                    </Text>
                </View>

                <View style={styles.metaRow}>
                    <Ionicons name="person-outline" size={14} color={colors.text.tertiary} />
                    <Text style={styles.metaText} numberOfLines={1}>{other?.given_name || '—'}</Text>
                </View>
                {/* The engine shares the phone only once ACCEPTED, so this row
                    mounts exactly at the moment the contact unlocks — FadeSlideIn
                    (reduce-motion aware) makes that a small arrival, not a pop.
                    Keyed on status so a refetch that flips PENDING → ACCEPTED
                    replays the entrance. */}
                {other?.phone_number ? (
                    <FadeSlideIn key={`${item.id}-${item.status}`} index={0} delay={120}>
                        <TouchableOpacity
                            style={[styles.phoneRow, { backgroundColor: withAlpha(colors.success, 0.1), borderColor: withAlpha(colors.success, 0.33) }]}
                            onPress={() => Linking.openURL(`tel:${String(other.phone_number).replace(/[\s-]/g, '')}`)}
                            hitSlop={interactions.hitSlop}
                            activeOpacity={interactions.activeOpacityLight}
                            accessibilityRole="link"
                            accessibilityLabel={other.phone_number}
                        >
                            <Ionicons name="call" size={14} color={isDark ? colors.successLight : colors.successDark} />
                            <Text style={[styles.phoneLabel, { color: isDark ? colors.successLight : colors.successDark }]} numberOfLines={1}>
                                {t('booking.timelineContact')}
                            </Text>
                            <Text style={[styles.metaText, styles.phoneLink]}>{other.phone_number}</Text>
                        </TouchableOpacity>
                    </FadeSlideIn>
                ) : null}

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
                            disabled={anyBusy}
                            loading={busyAction === 'accept'}
                            onPress={() => actionMut.mutate({ action: 'accept', id: item.id })}
                            style={styles.actionBtn}
                        />
                        <Button
                            title={t('booking.decline')}
                            size="small"
                            variant="danger"
                            disabled={anyBusy}
                            loading={busyAction === 'decline'}
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
                            disabled={anyBusy}
                            loading={busyAction === 'cancel'}
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
            <SkeletonCrossfade
                loading={showSkeleton}
                skeleton={(
                    <FlatList
                        data={Array(5).fill({})}
                        renderItem={() => <SkeletonItem variant="booking" />}
                        keyExtractor={(_, i) => `sk-${i}`}
                        contentContainerStyle={styles.list}
                        scrollEnabled={false}
                    />
                )}
            >
            {isError ? (
                <ScreenError onRetry={refetch} />
            ) : bookings.length === 0 ? (
                <EmptyState
                    icon="calendar-outline"
                    iconSize={64}
                    variant={isProviderView ? 'neutral' : 'invitation'}
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
            </SkeletonCrossfade>
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
    periodBlock: { gap: spacing.xxs },
    periodLabel: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        color: colors.text.tertiary,
    },
    periodText: {
        ...typography.styles.labelStrong,
        color: colors.text.primary,
        fontVariant: ['tabular-nums'],
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    metaText: { ...typography.styles.caption, color: colors.text.secondary, flexShrink: 1 },
    phoneLink: { color: colors.text.link, textDecorationLine: 'underline' },
    phoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.card,
        borderWidth: 1,
    },
    phoneLabel: { ...typography.styles.badge, flex: 1 },
    message: { ...typography.styles.caption, color: colors.text.tertiary, backgroundColor: colors.background, borderRadius: radius.card, padding: spacing.md },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
    actionBtn: { flex: 1 },
});

export default BookingListScreen;
