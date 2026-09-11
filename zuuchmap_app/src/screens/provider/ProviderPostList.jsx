import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, withAlpha } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import postService from '../../services/api/postService';
import userService from '../../services/api/userService';
import NotificationBell from '../../components/NotificationBell';
import PostCard from '../../components/PostCard';
import CategoryBadge from '../../components/CategoryBadge';
import UnreachableBanner from '../../components/UnreachableBanner';
import { ScreenLayout, SkeletonItem, EmptyState, StatusBadge } from '../../components';
import { formatPrice, formatDate } from '../../utils/displayUtils';
import { getPostTitle, getFixedImageUrl, getPostImage } from '../../utils/postUtils';
import { showErrorModal, showInfoModal, showActionSheet } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { invalidatePostData } from '../../services/queryClient';

const PostItem = React.memo(({
    item,
    onPress,
    onEdit,
    onDelete,
    onRenew,
    onFeature,
    isLoading,
    getPostTitle,
    colors,
    t,
    stat,
    // `memoKey` below is built from these. They live on the parent screen, so
    // they have to arrive as props — this component sits at module scope and
    // sees nothing of that closure.
    locale,
    isDark,
}) => {
    const styles = useMemo(() => createStyles(colors), [colors]);
    const imageUri = getPostImage(item);
    const title = getPostTitle(item, item.postType);

    // Renewable: published, and either already lapsed or within a week of it.
    // Offered from the same sheet as edit, because editing was the only way back
    // from an expiry before this and it cost a trip through moderation.
    const canRenew = item.approval_status === 'APPROVED' && item.expires_at
        && (new Date(item.expires_at) - Date.now()) / 86400000 <= 7;

    // Featurable: published, live, and with more than a day left. Placement
    // only sorts listings that are already in browse, and the engine refuses
    // the rest — offering a row that always errors would be worse than not
    // offering it.
    const canFeature = item.approval_status === 'APPROVED'
        && (item.status ?? 'ACTIVE') === 'ACTIVE'
        && (!item.expires_at || new Date(item.expires_at) - Date.now() > 86400000);
    const isFeatured = !!item.featured_until && new Date(item.featured_until) > new Date();

    const handleMenuPress = useCallback(() => {
        showActionSheet(title, [
            ...(canRenew ? [{ text: t('posts.renew'), onPress: () => onRenew(item) }] : []),
            ...(canFeature ? [{
                text: isFeatured ? t('billing.featured.extend') : t('billing.featured.action'),
                onPress: () => onFeature(item),
            }] : []),
            { text: t('common.edit'), onPress: () => onEdit(item) },
            { text: t('common.cancel'), style: 'cancel' },
            // Destructive last: it used to sit second, a full-width red button
            // with the same weight as Edit and directly under the thumb.
            { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(item) },
        ]);
    }, [item, title, canRenew, canFeature, isFeatured, onEdit, onDelete, onRenew, onFeature, t]);

    const expiry = item.expires_at ? (() => {
        const days = Math.ceil((new Date(item.expires_at) - Date.now()) / 86400000);
        const label = days < 0
            ? t('posts.expired')
            : days === 0 ? t('posts.expiresToday')
            : t('posts.expiresIn', { days });
        return { label, color: days <= 5 ? (days < 0 ? colors.danger : colors.warning) : undefined };
    })() : null;

    return (
        <PostCard
            item={item}
            onPress={onPress}
            imageUri={imageUri ? getFixedImageUrl(imageUri) : null}
            title={title}
            price={item.price_amount ? formatPrice(item.price_amount, item.price_unit) : (item.price || null)}
            memoKey={`${locale}-${isDark}-${isLoading}-${item.approval_status}-${item.rejection_reason}-${!!item.pending_revision}-${item.expires_at}-${stat?.views}-${stat?.likes}-${stat?.bookings_pending}-${stat?.bookings_accepted}`}
            badges={<>
                <CategoryBadge postType={item.post_type || item.category || 'construction'} showIcon={true} />
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
                {/* Live, with an edit waiting behind it. Without this the owner
                    reads their own old wording back and thinks the save failed. */}
                {!!item.pending_revision && (
                    <View style={styles.approvalBadgeRow}>
                        <Text style={styles.editInReview} numberOfLines={1}>
                            {t('posts.editInReview')}
                        </Text>
                    </View>
                )}
                {item.approval_status === 'APPROVED' && !item.pending_revision && !!item.rejection_reason && (
                    <View style={styles.approvalBadgeRow}>
                        <Text style={styles.rejectionReason} numberOfLines={2}>
                            {t('posts.editRejected', { reason: item.rejection_reason })}
                        </Text>
                    </View>
                )}
            </>}
            actions={
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
            }
        >
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
            {expiry && (
                <Text style={[styles.postDate, expiry.color && { color: expiry.color }]}>{expiry.label}</Text>
            )}
        </PostCard>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.item.id === nextProps.item.id &&
        prevProps.item.status === nextProps.item.status &&
        prevProps.item.approval_status === nextProps.item.approval_status &&
        prevProps.item.rejection_reason === nextProps.item.rejection_reason &&
        prevProps.item.expires_at === nextProps.item.expires_at &&
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
    const { t, i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const [isLoading, setIsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

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
        // Under the `['posts']` prefix so invalidatePostData() reaches it.
        queryKey: ['posts', 'mine'],
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
    const queryLoading = queryLoadingRaw;

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
        queryKey: ['posts', 'mine', 'stats'],
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

    /**
     * Reopen a lapsed post's window.
     *
     * The only route back from an expiry used to be an edit, which sent the
     * post into the moderation queue for a change its owner never wanted to
     * make — so a listing that lapsed needed an admin before it could exist
     * again. The content is already approved; this just moves the date.
     */
    const handleRenewPost = useCallback(async (post) => {
        try {
            await postService.renew(post.id);
            invalidatePostData();
            showInfoModal(t('posts.renewed'), t('posts.renewedDesc'));
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                await handleAuthError();
                return;
            }
            // At the limit a renewal is a create in disguise — it puts a post
            // back into browse — so the same quota answer applies.
            const data = error.response?.data;
            showErrorModal(
                t('common.error'),
                data?.message === 'POST_QUOTA_EXCEEDED'
                    ? t('posts.quotaExceeded', { limit: data.limit })
                    : t('posts.renewError'),
            );
        }
    }, [handleAuthError, t]);

    /**
     * Hand one listing to the till. The billing screen owns the QR and the
     * poll — there is one place in the app that talks to QPay, and adding a
     * second would be a second copy of the settlement dance.
     */
    const handleFeaturePost = useCallback((post) => {
        navigation.navigate('Billing', {
            postId: post.id,
            postTitle: getPostTitle(post, post.postType),
            expiresAt: post.expires_at ?? null,
        });
    }, [navigation]);

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

    const renderListHeader = useCallback(() => (
        <>
            {/* Before the plan bar: a provider whose enquiries reach nobody has a
                bigger problem than how many posts are left on their tier. */}
            <UnreachableBanner />
            {renderPlanBar()}
        </>
    ), [renderPlanBar]);

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
        <View style={isTablet && { flex: 1 }}>
        <PostItem
            item={item}
            onPress={handlePostPress}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
            onRenew={handleRenewPost}
            onFeature={handleFeaturePost}
            isLoading={isLoading || item.isDeleting}
            getPostTitle={getPostTitleWrapped}
            colors={colors}
            t={t}
            stat={statsById.get(item.id)}
            locale={i18n.language}
            isDark={isDark}
        />
        </View>
    ), [handlePostPress, handleEditPost, handleDeletePost, handleRenewPost, handleFeaturePost, isLoading, getPostTitleWrapped, colors, t, statsById, i18n.language, isDark]);

    if (queryError && posts.length === 0) {
        return (
            <ScreenLayout
                title={t('posts.myPosts')}
                showBack={false}
                rightComponent={<NotificationBell />}
                error
                errorTitle={t('common.error')}
                errorMessage={t('posts.loadError')}
                onRetry={refetch}
            />
        );
    }

    return (
        <ScreenLayout title={t('posts.myPosts')} showBack={false} rightComponent={<NotificationBell />}>

            {queryLoading && posts.length === 0 ? (
                <FlatList
                    data={Array(5).fill({})}
                    numColumns={isTablet ? 2 : 1}
                    key={isTablet ? 'tablet-skeleton' : 'phone-skeleton'}
                    columnWrapperStyle={isTablet ? { gap: spacing.md } : undefined}
                    renderItem={() => <View style={isTablet && { flex: 1 }}><SkeletonItem /></View>}

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
                    actionButton={atQuota ? {
                        // At the limit the wizard can only end in a refusal, after
                        // the whole form and the photo upload. Send them to the
                        // screen that can actually resolve it.
                        icon: "arrow-up-circle",
                        text: t('posts.quotaUpgrade'),
                        onPress: () => navigation.navigate('Billing'),
                    } : {
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
        </ScreenLayout>
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
    menuButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
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
    // Amber, not red: the listing is fine and still published — only the edit
    // is waiting. Red here would read as "your post is in trouble".
    editInReview: {
        ...typography.styles.small,
        color: colors.warning,
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
