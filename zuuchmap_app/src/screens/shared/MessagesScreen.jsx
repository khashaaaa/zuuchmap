import React, { useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import ScreenError from '../../components/ScreenError';
import { ScreenLayout, EmptyState, SkeletonItem, PressableScale, FadeSlideIn } from '../../components';
import { useListEntrance } from '../../components/FadeSlideIn';
import { SkeletonCrossfade } from '../../components/SkeletonItem';
import ThumbImage from '../../components/ThumbImage';
import messageService, { inboxCursor, CONVERSATIONS_KEY } from '../../services/api/messageService';
import { getPostImageUrl } from '../../config/api.config';
import { formatInboxStamp } from '../../utils/displayUtils';
import { useListBottomPadding } from '../../hooks/useListBottomPadding';

/**
 * The inbox.
 *
 * One thread per (listing, customer): the same customer asking about an
 * excavator and about a truck is asking two different questions, and merging
 * them into one thread loses which listing is being discussed.
 */
const ThreadRow = ({ item, entrance, onPress, styles, colors, t }) => {
    const image = item.post?.images?.[0] ? getPostImageUrl(item.post.images[0]) : null;
    return (
        <FadeSlideIn {...entrance}>
            <PressableScale style={styles.row} onPress={() => onPress(item)} accessibilityRole="button">
                <View style={styles.thumb}>
                    {image ? (
                        <ThumbImage uri={image} style={styles.thumbImage} />
                    ) : (
                        <Ionicons name="chatbubble-outline" size={18} color={colors.text.tertiary} />
                    )}
                </View>

                <View style={styles.body}>
                    <View style={styles.headline}>
                        <Text style={styles.name} numberOfLines={1}>
                            {item.other_party?.given_name || '—'}
                        </Text>
                        <Text style={styles.time}>{formatInboxStamp(item.last_message_at)}</Text>
                    </View>
                    {/* The unread count sits under the date, not beside the
                        body: a trailing badge pushed only the unread rows'
                        dates inward, so the date column broke at every one. */}
                    <View style={styles.subline}>
                        <Text style={[styles.listing, styles.flexText]} numberOfLines={1}>
                            {item.post?.title || t('messages.deletedListing')}
                        </Text>
                        {item.unread > 0 && (
                            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                                <Text style={[styles.badgeText, { color: colors.onPrimary }]}>
                                    {item.unread > 99 ? '99+' : item.unread}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.preview} numberOfLines={1}>
                        {item.last_message_preview || ''}
                    </Text>
                </View>
            </PressableScale>
        </FadeSlideIn>
    );
};

const MessagesScreen = ({ navigation }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const listBottom = useListBottomPadding();
    const entrance = useListEntrance();

    const {
        data, isLoading, isRefetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: CONVERSATIONS_KEY,
        queryFn: ({ pageParam }) => messageService.list(pageParam),
        initialPageParam: undefined,
        getNextPageParam: inboxCursor,
        staleTime: 30 * 1000,
    });
    const threads = useMemo(() => (data?.pages ?? []).flat(), [data]);

    const open = useCallback(
        (thread) => navigation.navigate('MessageThread', { id: thread.id, title: thread.other_party?.given_name }),
        [navigation]
    );

    const showSkeleton = isLoading;

    // This screen is both a tab root (all three dashboards) and a pushed stack
    // route (the "Мессеж" row on the profile). Only the pushed one has anywhere
    // to go back to — as a tab root the arrow silently switched tabs, and the
    // sibling tabs show no arrow at all.
    const isPushed = navigation.getState?.()?.type === 'stack';

    return (
        <ScreenLayout
            title={t('messages.title')}
            onBack={isPushed ? () => navigation.goBack() : undefined}
        >
            <SkeletonCrossfade
                loading={showSkeleton}
                skeleton={(
                    <FlatList
                        data={Array(5).fill({})}
                        renderItem={() => <SkeletonItem variant="booking" />}
                        keyExtractor={(_, i) => `sk-${i}`}
                        contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
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
                                entrance={entrance(item.id, index)}
                                onPress={open}
                                styles={styles}
                                colors={colors}
                                t={t}
                            />
                        )}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
                        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={isFetchingNextPage ? (
                            <View style={styles.listFooter}>
                                <ActivityIndicator size="small" color={colors.iconAccent} />
                            </View>
                        ) : null}
                        refreshControl={
                            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.iconAccent} />
                        }
                    />
                )}
            </SkeletonCrossfade>
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
    listFooter: { paddingVertical: spacing.md, alignItems: 'center' },
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
    subline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20 },
    flexText: { flex: 1 },
    preview: { ...typography.styles.body, color: colors.text.secondary },
    badge: {
        minWidth: 20, height: 20, borderRadius: radius.pill,
        paddingHorizontal: spacing.xs,
        alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { ...typography.styles.badge },
});

export default MessagesScreen;
