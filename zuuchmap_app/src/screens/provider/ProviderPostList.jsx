import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    Image,
    RefreshControl,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, animations, withAlpha } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import { useTranslation } from 'react-i18next';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import postService from '../../services/api/postService';
import userService from '../../services/api/userService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import PressableScale from '../../components/PressableScale';
import NotificationBell from '../../components/NotificationBell';
import { CategoryBadge, SkeletonItem, EmptyState, FadeSlideIn, StatusBadge } from '../../components';
import ScreenError from '../../components/ScreenError';
import { formatPrice, formatDate } from '../../utils/displayUtils';
import { getPostTitle, getFixedImageUrl, getPostImage } from '../../utils/postUtils';
import { showErrorModal, showInfoModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { invalidatePostData } from '../../services/queryClient';

const PostItem = React.memo(({
    item,
    onPress,
    onEdit,
    onDelete,
    imageErrors,
    isLoading,
    getPostTitle,
    setImageErrors,
    colors,
    t,
    stat,
}) => {
    const styles = useMemo(() => createStyles(colors), [colors]);
    const itemId = `${item.postType}-${item.id}`;
    const hasImageError = imageErrors[itemId];
    const imageUri = getFixedImageUrl(getPostImage(item));

    const handleMenuPress = useCallback(() => {
        showInfoModal(
            getPostTitle(item, item.postType),
            null,
            [
                { text: t('common.edit'), onPress: () => onEdit(item) },
                { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(item) },
                { text: t('common.cancel'), style: 'cancel' },
            ],
        );
    }, [item, onEdit, onDelete, getPostTitle, t]);

    return (
        <PressableScale
            style={[styles.postCard, { backgroundColor: colors.surface }]}
            onPress={() => onPress(item)}
            accessibilityRole="button"
        >
            <View style={[styles.imageContainer, { backgroundColor: colors.border.light }]}>
                {!imageUri || hasImageError ? (
                    <View style={styles.noImageContainer}>
                        <Ionicons name="image-outline" size={28} color={colors.iconAccent} />
                    </View>
                ) : (
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.postImage}
                        resizeMode="cover"
                        onError={() => setImageErrors(prev => ({ ...prev, [itemId]: true }))}
                        fadeDuration={animations.duration.fast}
                    />
                )}
            </View>

            <View style={styles.postContent}>
                <View style={styles.postHeader}>
                    <Text style={styles.postTitle} numberOfLines={2}>
                        {getPostTitle(item, item.postType)}
                    </Text>
                    <TouchableOpacity
                        style={styles.menuButton}
                        onPress={handleMenuPress}
                        disabled={isLoading}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.more')}
                        hitSlop={interactions.hitSlop}
                    >
                        {isLoading
                            ? <ActivityIndicator size="small" color={colors.iconAccent} />
                            : <Ionicons name="ellipsis-vertical" size={18} color={colors.text.tertiary} />
                        }
                    </TouchableOpacity>
                </View>

                <CategoryBadge postType={item.postType} showIcon={true} />

                {!!item.featured_until && new Date(item.featured_until) > new Date() && (
                    <View style={styles.featuredChip}>
                        <Ionicons name="star" size={11} color={colors.onPrimary} />
                        <Text style={styles.featuredChipText} numberOfLines={1}>{t('posts.featured')}</Text>
                    </View>
                )}

                {/* The shared badge, not a local one. This screen used to draw its
                    own tinted-outline chip from `posts.approval.*`, so the same
                    post read "Under review" here in an outlined chip and
                    "Pending" on the detail screen in a solid pill. */}
                {(item.approval_status === 'PENDING' || item.approval_status === 'REJECTED') && (
                    <View style={styles.approvalBadgeRow}>
                        <StatusBadge
                            status={item.approval_status}
                            variant="inline"
                            position="relative"
                            showIndicator={false}
                        />
                        {item.approval_status === 'REJECTED' && item.rejection_reason && (
                            <Text style={styles.rejectionReason} numberOfLines={2}>{item.rejection_reason}</Text>
                        )}
                    </View>
                )}

                {(item.price_amount || item.price) && (
                    <Text style={styles.postPrice}>
                        {item.price_amount ? formatPrice(item.price_amount, item.price_unit) : item.price}
                    </Text>
                )}

                {stat && (
                    <View style={styles.attentionRow}>
                        <View style={styles.attentionItem}>
                            <Ionicons name="eye-outline" size={13} color={colors.text.tertiary} />
                            <Text style={styles.attentionText}>{stat.views}</Text>
                        </View>
                        <View style={styles.attentionItem}>
                            <Ionicons name="heart-outline" size={13} color={colors.text.tertiary} />
                            <Text style={styles.attentionText}>{stat.likes}</Text>
                        </View>
                        <View style={styles.attentionItem}>
                            <Ionicons name="calendar-outline" size={13} color={colors.text.tertiary} />
                            <Text style={styles.attentionText}>{stat.bookings_pending + stat.bookings_accepted}</Text>
                        </View>
                    </View>
                )}

                <Text style={styles.postDate}>
                    {item.date_created ? formatDate(item.date_created) : ''}
                </Text>
                {item.expires_at && (() => {
                    const days = Math.ceil((new Date(item.expires_at) - Date.now()) / 86400000);
                    const isUrgent = days <= 5;
                    const label = days < 0
                        ? t('posts.expired')
                        : days === 0 ? t('posts.expiresToday')
                        : t('posts.expiresIn', { days });
                    return (
                        <Text style={[styles.postDate, isUrgent && { color: days < 0 ? colors.danger : colors.warning }]}>
                            {label}
                        </Text>
                    );
                })()}
            </View>
        </PressableScale>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.item.id === nextProps.item.id &&
        prevProps.item.status === nextProps.item.status &&
        prevProps.item.approval_status === nextProps.item.approval_status &&
        prevProps.item.rejection_reason === nextProps.item.rejection_reason &&
        prevProps.item.expires_at === nextProps.item.expires_at &&
        prevProps.imageErrors[`${prevProps.item.postType}-${prevProps.item.id}`] ===
        nextProps.imageErrors[`${nextProps.item.postType}-${nextProps.item.id}`] &&
        prevProps.isLoading === nextProps.isLoading &&
        prevProps.colors === nextProps.colors &&
        prevProps.stat?.views === nextProps.stat?.views &&
        prevProps.stat?.likes === nextProps.stat?.likes &&
        prevProps.stat?.bookings_pending === nextProps.stat?.bookings_pending &&
        prevProps.stat?.bookings_accepted === nextProps.stat?.bookings_accepted
    );
});

// Matches the server default for /posts/mine.
const MINE_PAGE_SIZE = 50;

const ProviderPostList = ({ navigation }) => {
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [isLoading, setIsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [imageErrors, setImageErrors] = useState({});

    // `/posts/mine` is capped server-side (post.service.ts findByUser), so the
    // list has to page. It used to fetch one page and present it as everything,
    // which contradicted the totals in the stats row directly above it.
    const {
        data: queryData,
        isLoading: queryLoadingRaw,
        isError: queryError,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['provider', 'mine'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const response = await postService.getMine({ page: pageParam, limit: MINE_PAGE_SIZE });
            const raw = Array.isArray(response?.data) ? response.data : (response?.data?.posts ?? []);
            return { items: raw, page: pageParam };
        },
        // The endpoint answers with a bare array, so a short page is the signal
        // that there is nothing after it.
        getNextPageParam: (last) => (last.items.length === MINE_PAGE_SIZE ? last.page + 1 : undefined),
        staleTime: 0,
    });
    const queryLoading = useMinDisplayTime(queryLoadingRaw);

    const posts = useMemo(
        () => (queryData?.pages ?? []).flatMap((pg) => pg.items)
            .map(p => ({ ...p, postType: p.category, post_type: p.category })),
        [queryData],
    );

    const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Server-side attention stats (saves + booking requests need joins the
    // list payload doesn't carry). Non-blocking: tiles show local numbers
    // immediately and upgrade when this lands.
    const { data: serverStats } = useQuery({
        queryKey: ['provider', 'mine', 'stats'],
        queryFn: () => postService.getMyStats(),
        staleTime: 60_000,
    });
    const plan = serverStats?.plan ?? null;
    const atQuota = Boolean(plan && plan.posts_active >= plan.post_limit);


    const keyExtractor = useCallback((item) => `${item.postType}-${item.id}`, []);

    // Check user role once on mount — redirect if not set
    useEffect(() => {
        userService.getUserType().then(userType => {
            if (!userType) {
                navigation.reset({ index: 0, routes: [{ name: 'UserRoleSelection' }] });
            }
        }).catch(err => logger.error('Error checking user role:', err));
    }, []);

    // Reload posts every time this screen is focused (handles create/edit/delete/approve)
    useFocusEffect(
        useCallback(() => {
            setImageErrors({});
            refetch();
        }, [refetch])
    );

    const handleAuthError = async () => {
        try {
            const { getAuthToken, getUserType } = await import('../../services/api/authHelpers');
            const { clearAuthData } = await import('../../services/api/authHelpers');
            const { navigateToPhoneNumber } = await import('../../utils/navigationUtils');
            
            const token = await getAuthToken();
            const userType = await getUserType();

            if (token && !userType) {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'UserRoleSelection' }]
                });
            } else {
                await clearAuthData();
                navigateToPhoneNumber(navigation);
            }
        } catch (error) {
            logger.error('Error handling auth failure:', error);
            const { navigateToPhoneNumber } = await import('../../utils/navigationUtils');
            navigateToPhoneNumber(navigation);
        }
    };

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        refetch().finally(() => setRefreshing(false));
    }, [refetch]);

    const handlePostPress = useCallback((post) => {
        navigation.navigate('PostDetailScreen', {
            postId: post.id,
            postType: post.postType,
            role: 'provider'
        });
    }, [navigation]);

    const handleEditPost = useCallback(async (post) => {
        try {
            setIsLoading(true);

            const response = await postService.getById(post.id);

            if (response.data) {
                navigation.navigate('ProviderPostEdit', {
                    postId: post.id,
                    postType: post.postType,
                    post: response.data
                });
            } else {
                showErrorModal(t('common.error'), t('posts.editLoadError'));
            }
        } catch (error) {
            logger.error('Error loading post for edit:', error);

            if (error.code === 'AUTH_TOKEN_MISSING' ||
                error.response?.status === 401 ||
                error.response?.status === 403) {
                await handleAuthError();
            } else {
                showErrorModal(t('common.error'), t('posts.loadError'));
            }
        } finally {
            setIsLoading(false);
        }
    }, [navigation, handleAuthError, t]);

    const handleDeletePost = useCallback((post) => {
        showErrorModal(
            t('posts.delete'),
            t('common.irreversible'),
            [
                { text: t('common.cancel') },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await postService.deletePost(post.id);
                            invalidatePostData();
                        } catch (error) {
                            if (error.code === 'AUTH_TOKEN_MISSING' ||
                                error.response?.status === 401 ||
                                error.response?.status === 403) {
                                await handleAuthError();
                            } else {
                                // A refusal the engine can explain (a live booking
                                // on the post) is worth repeating verbatim — the
                                // generic line leaves the provider retrying a
                                // delete that will never succeed.
                                const code = error.response?.data?.code;
                                showErrorModal(
                                    t('common.error'),
                                    code
                                        ? t(`errors.codes.${code}`, { defaultValue: t('posts.deleteError') })
                                        : t('posts.deleteError'),
                                );
                            }
                        }
                    }
                }
            ]
        );
    }, [refetch, handleAuthError, t]);

    // Plan and quota. The engine refuses the next post at the limit, so the
    // number belongs here — in front of the "add post" path — rather than in
    // the rejection the form would otherwise be the first to mention.
    const renderPlanBar = useCallback(() => {
        if (!plan) return null;
        const pct = Math.min(plan.posts_active / Math.max(plan.post_limit, 1), 1);
        return (
            <View style={[styles.planBar, { backgroundColor: colors.surface }]}>
                <View style={styles.planHead}>
                    <View style={[
                        styles.planChip,
                        plan.name === 'PROVIDER'
                            ? { backgroundColor: withAlpha(colors.primary, 0.12), borderColor: withAlpha(colors.primary, 0.25) }
                            : { borderColor: colors.border.light },
                    ]}>
                        <Text style={[
                            styles.planChipText,
                            { color: plan.name === 'PROVIDER' ? colors.text.primary : colors.text.secondary },
                        ]}>
                            {plan.name === 'PROVIDER' ? t('posts.planProvider') : t('posts.planFree')}
                        </Text>
                    </View>
                    <Text style={[styles.planQuota, atQuota && { color: colors.warning }]}>
                        {t('posts.quotaUsed', { used: plan.posts_active, limit: plan.post_limit })}
                    </Text>
                </View>
                <View style={[styles.planTrack, { backgroundColor: colors.border.light }]}>
                    <View style={[
                        styles.planFill,
                        { width: `${pct * 100}%`, backgroundColor: atQuota ? colors.warning : colors.primary },
                    ]} />
                </View>
                {plan.expires_at && (
                    <Text style={styles.planMeta}>
                        {t('posts.planExpires')} {formatDate(plan.expires_at)}
                    </Text>
                )}
                {atQuota && <Text style={[styles.planMeta, { color: colors.warning }]}>{t('posts.quotaFull')}</Text>}
            </View>
        );
    }, [plan, atQuota, styles, colors, t]);

    const renderListHeader = useCallback(() => renderPlanBar(), [renderPlanBar]);

    const getPostTitleWrapped = useCallback(
        (item) => getPostTitle(item, item.postType),
        []
    );

    const statsById = useMemo(() => {
        const map = new Map();
        for (const s of serverStats?.posts ?? []) map.set(s.id, s);
        return map;
    }, [serverStats]);

    // Listing-quality score needs each post's schema (field count, has_price).

    const renderPostItem = useCallback(({ item, index }) => (
        <FadeSlideIn index={index} style={isTablet && { flex: 1 }}>
        <PostItem
            item={item}
            onPress={handlePostPress}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
            imageErrors={imageErrors}
            isLoading={isLoading || item.isDeleting}
            getPostTitle={getPostTitleWrapped}
            setImageErrors={setImageErrors}
            colors={colors}
            t={t}
            stat={statsById.get(item.id)}
        />
        </FadeSlideIn>
    ), [handlePostPress, handleEditPost, handleDeletePost, imageErrors, isLoading, getPostTitleWrapped, colors, t, statsById]);

    if (queryError && posts.length === 0) {
        return (
            <CustomSafeAreaView
                backgroundColor={colors.background}
                statusBarColor={colors.surface}
                statusBarStyle={isDark ? 'light-content' : 'dark-content'}
            >
                <ScreenHeader title={t('posts.myPosts')} showBack={false} rightComponent={<NotificationBell />} />
                <ScreenError
                    title={t('common.error')}
                    message={t('posts.loadError')}
                    onRetry={refetch}
                />
            </CustomSafeAreaView>
        );
    }

    return (
        <CustomSafeAreaView
            backgroundColor={colors.background}
            statusBarColor={colors.surface}
            statusBarStyle={isDark ? 'light-content' : 'dark-content'}
        >
            <ScreenHeader title={t('posts.myPosts')} showBack={false} rightComponent={<NotificationBell />} />

            {queryLoading && posts.length === 0 ? (
                <FlatList
                    data={Array(5).fill({})}
                    renderItem={() => <SkeletonItem />}
                    keyExtractor={(_, index) => `skeleton-${index}`}
                    contentContainerStyle={[
                        styles.listContainer,
                        { paddingBottom: Math.max(safeAreaHelpers.getBottomSafeArea(insets), 50) + 50 }
                    ]}
                    showsVerticalScrollIndicator={false}
                />
            ) : posts.length === 0 ? (
                <EmptyState
                    icon="document-text-outline"
                    iconSize={64}
                    variant="invitation"
                    eyebrow={t('nav.myPosts')}
                    title={t('posts.noPosts')}
                    subtitle={t('posts.noPostsDesc')}
                    actionButton={{
                        icon: "add-circle",
                        text: t('posts.createNew'),
                        onPress: () => navigation.navigate('CategorySelectScreen', { role: 'provider' })
                    }}
                />
            ) : (
                <FlatList
                    data={posts}
                    renderItem={renderPostItem}
                    keyExtractor={keyExtractor}
                    numColumns={isTablet ? 2 : 1}
                    key={isTablet ? 'tablet' : 'phone'}
                    columnWrapperStyle={isTablet ? { gap: spacing.md } : undefined}
                    ListHeaderComponent={renderListHeader}
                    ListFooterComponent={isFetchingNextPage ? (
                        <View style={styles.listFooter}>
                            <ActivityIndicator size="small" color={colors.iconAccent} />
                        </View>
                    ) : null}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.4}
                    contentContainerStyle={[
                        styles.listContainer,
                        { paddingBottom: Math.max(safeAreaHelpers.getBottomSafeArea(insets), 50) + 50 }
                    ]}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            colors={[colors.primary]}
                            tintColor={colors.primary}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={6}
                    maxToRenderPerBatch={4}
                    windowSize={5}
                    removeClippedSubviews={true}
                    updateCellsBatchingPeriod={100}
                />
            )}
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    listFooter: {
        paddingVertical: spacing.lg,
        alignItems: 'center',
    },
    listContainer: {
        padding: spacing.lg,
    },
    postCard: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        marginBottom: spacing.md,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: colors.border.light,
    },
    // Paid placement, shown to the owner so they can see what they bought.
    featuredChip: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        maxWidth: '100%',
        marginTop: spacing.xs,
        backgroundColor: colors.primary,
        paddingVertical: spacing.xxs,
        paddingHorizontal: spacing.xs,
        borderRadius: radius.sm,
    },
    featuredChipText: {
        ...typography.styles.overline,
        color: colors.onPrimary,
        // Yoga defaults flexShrink to 0 — without this a long translation
        // pushes the star out of the chip instead of truncating.
        flexShrink: 1,
    },
    imageContainer: {
        width: 96,
        alignSelf: 'stretch',
        backgroundColor: colors.border.light,
    },
    postImage: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    noImageContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    postContent: {
        flex: 1,
        padding: spacing.md,
        gap: spacing.xs,
    },
    postHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.xs,
    },
    postTitle: {
        ...typography.styles.title,
        flex: 1,
        color: colors.text.primary,
    },
    menuButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    postPrice: {
        ...typography.styles.price,
        color: colors.text.link,
    },
    postDate: {
        ...typography.styles.small,
        color: colors.text.tertiary,
    },
    approvalBadgeRow: {
        alignSelf: 'flex-start',
        gap: spacing.xxs,
    },
    rejectionReason: {
        ...typography.styles.small,
        color: colors.danger,
        marginTop: spacing.xs,
    },
    attentionRow: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.xs,
    },
    attentionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
    },
    attentionText: {
        ...typography.styles.small,
        fontVariant: ['tabular-nums'],
        color: colors.text.tertiary,
    },
    planBar: {
        ...colors.elevation.sm,
        borderRadius: radius.card,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginBottom: spacing.md,
        gap: spacing.xs,
    },
    planHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    planChip: {
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
    },
    planChipText: { ...typography.styles.caption },
    planQuota: { ...typography.styles.caption, color: colors.text.secondary },
    planTrack: { height: 3, borderRadius: radius.pill, overflow: 'hidden' },
    planFill: { height: '100%', borderRadius: radius.pill },
    planMeta: { ...typography.styles.caption, color: colors.text.secondary },
    // flexBasis 47% + grow: two tiles per row on phones, and a lone pair
    // still fills the width while the server tiles are loading.
    statCard: {
        ...colors.elevation.sm,
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
});

export default ProviderPostList;
