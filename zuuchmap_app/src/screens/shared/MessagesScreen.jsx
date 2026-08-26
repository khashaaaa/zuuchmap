import React, { useMemo, useCallback } from 'react';
import { View, Text, FlatList, Image, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import ScreenError from '../../components/ScreenError';
import { EmptyState, SkeletonItem, FadeSlideIn, PressableScale } from '../../components';
import { SkeletonCrossfade } from '../../components/SkeletonItem';
import messageService, { CONVERSATIONS_KEY } from '../../services/api/messageService';
import { getPostImageUrl } from '../../config/api.config';

/**
 * The inbox.
 *
 * One thread per (listing, customer): the same customer asking about an
 * excavator and about a truck is asking two different questions, and merging
 * them into one thread loses which listing is being discussed.
 */
const ThreadRow = ({ item, index, onPress, styles, colors, t }) => {
    const image = item.post?.images?.[0] ? getPostImageUrl(item.post.images[0]) : null;
    return (
        <FadeSlideIn index={index}>
            <PressableScale style={styles.row} onPress={() => onPress(item)} accessibilityRole="button">
                <View style={styles.thumb}>
                    {image ? (
                        <Image source={{ uri: image }} style={styles.thumbImage} />
                    ) : (
                        <Ionicons name="chatbubble-outline" size={18} color={colors.text.tertiary} />
                    )}
                </View>

                <View style={styles.body}>
                    <View style={styles.headline}>
                        <Text style={styles.name} numberOfLines={1}>
                            {item.other_party?.given_name || '—'}
                        </Text>
                        <Text style={styles.time}>{stamp(item.last_message_at)}</Text>
                    </View>
                    <Text style={styles.listing} numberOfLines={1}>
                        {item.post?.title || t('messages.deletedListing')}
                    </Text>
                    <Text style={styles.preview} numberOfLines={1}>
                        {item.last_message_preview || ''}
                    </Text>
                </View>

                {item.unread > 0 && (
                    <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.badgeText, { color: colors.onPrimary }]}>
                            {item.unread > 99 ? '99+' : item.unread}
                        </Text>
                    </View>
                )}
            </PressableScale>
        </FadeSlideIn>
    );
};

/**
 * Time for today, date for anything older — an inbox full of "14:32" says
 * nothing about which conversations have gone cold. Built by hand, not through
 * Intl: RN's JSC has no full ICU on Android and a locale format silently falls
 * back to en-US there (the same rule `formatDate` follows).
 */
function stamp(value) {
    if (!value) return '';
    const d = new Date(value);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return d >= startOfToday
        ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
        : `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

const MessagesScreen = ({ navigation }) => {
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    const { data: threads = [], isLoading, isRefetching, isError, refetch } = useQuery({
        queryKey: CONVERSATIONS_KEY,
        queryFn: messageService.list,
        staleTime: 30 * 1000,
    });

    const open = useCallback(
        (thread) => navigation.navigate('MessageThread', { id: thread.id, title: thread.other_party?.given_name }),
        [navigation]
    );

    const showSkeleton = useMinDisplayTime(isLoading);

    return (
        <CustomSafeAreaView
            backgroundColor={colors.background}
            statusBarColor={colors.surface}
            statusBarStyle={isDark ? 'light-content' : 'dark-content'}
        >
            <ScreenHeader title={t('messages.title')} onBack={() => navigation.goBack()} />
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
                ) : threads.length === 0 ? (
                    <EmptyState
                        icon="chatbubbles-outline"
                        iconSize={64}
                        variant="invitation"
                        title={t('messages.empty')}
                        subtitle={t('messages.emptyHint')}
                    />
                ) : (
                    <FlatList
                        data={threads}
                        renderItem={({ item, index }) => (
                            <ThreadRow
                                item={item}
                                index={index}
                                onPress={open}
                                styles={styles}
                                colors={colors}
                                t={t}
                            />
                        )}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={styles.list}
                        refreshControl={
                            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.iconAccent} />
                        }
                    />
                )}
            </SkeletonCrossfade>
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    list: { padding: spacing.lg, ...(isTablet ? { maxWidth: 680, alignSelf: 'center', width: '100%' } : {}) },
    row: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.md,
        marginBottom: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    thumb: {
        width: 48, height: 48, borderRadius: radius.button,
        backgroundColor: colors.surfaceElevated,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
    },
    thumbImage: { width: '100%', height: '100%' },
    body: { flex: 1, gap: spacing.xxs },
    headline: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
    name: { ...typography.styles.title, color: colors.text.primary, flex: 1 },
    time: { ...typography.styles.small, color: colors.text.tertiary },
    listing: { ...typography.styles.caption, color: colors.text.tertiary },
    preview: { ...typography.styles.body, color: colors.text.secondary },
    badge: {
        minWidth: 24, height: 24, borderRadius: radius.full,
        paddingHorizontal: spacing.xs,
        alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { ...typography.styles.badge },
});

export default MessagesScreen;
