import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
    View,
    Text,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import likeService from '../../services/api/likeService';
import userService from '../../services/api/userService';
import { getPostImageUrl } from '../../config/api.config';
import LikeButton from '../../components/LikeButton';
import PostCard from '../../components/PostCard';
import EmptyState from '../../components/EmptyState';
import ScreenError from '../../components/ScreenError';
import { ScreenLayout, SkeletonItem, SkeletonCrossfade } from '../../components';
import { useToggleLike } from '../../hooks/useToggleLike';
import { showErrorModal, isPostLogoutStraggler } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { getPostTitle, normalizePostType, getPostPrice, getSchemaLabel } from '../../utils/postUtils';
import { useCategorySchemas } from '../../hooks/useCategorySchemas';

const LIKED_POSTS_KEY = ['liked', 'posts'];

const CustomerLikeList = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, styles: gStyles, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const { t, i18n } = useTranslation();

    // Labels come from the schema (admin-editable, covers new verticals with no
    // app release); the i18n key is only the fallback for a missing schema.
    const schemas = useCategorySchemas();
    const categoryLabel = useCallback((type) => {
        const key = normalizePostType(type);
        const schema = schemas.find((s) => s.key === key);
        return schema ? getSchemaLabel(schema) : t('category.' + key, { defaultValue: key });
    }, [schemas, t]);
    const qc = useQueryClient();
    // null = auth check in flight
    const [isAuthenticated, setIsAuthenticated] = useState(null);
    const authChecked = isAuthenticated !== null;

    const checkAuth = useCallback(() => {
        userService.isAuthenticated()
            .then((s) => setIsAuthenticated(!!s.authenticated))
            .catch((error) => {
                logger.error('Error checking authentication:', error);
                setIsAuthenticated(false);
            });
    }, []);

    useEffect(() => { checkAuth(); }, [checkAuth]);

    const {
        data, isLoading: loading, isRefetching, refetch,
        fetchNextPage, hasNextPage, isFetchingNextPage: loadingMore, error, isError,
    } = useInfiniteQuery({
        queryKey: LIKED_POSTS_KEY,
        enabled: isAuthenticated === true,
        queryFn: async ({ pageParam }) => {
            const response = await likeService.getUserLikedPosts(pageParam, 20);
            return { ...response.data, page: pageParam };
        },
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < (last.total_pages || 0) ? last.page + 1 : undefined),
        staleTime: 30 * 1000,
    });

    const posts = useMemo(() => (data?.pages ?? []).flatMap((p) => p.posts || []), [data]);
    const refreshing = isRefetching && !loadingMore;

    useEffect(() => {
        const status = error?.response?.status;
        // A logout straggler is also a 401. Telling someone who just signed out
        // that their session expired — and offering to sign them back in — is
        // the logout arriving as an alarm.
        if (isPostLogoutStraggler(error)) return;
        if (status === 401 || status === 403) {
            setIsAuthenticated(false);
            showErrorModal(
                t('auth.sessionExpired'),
                t('auth.sessionExpiredDesc'),
                [
                    { text: t('common.close') },
                    { text: t('auth.title'), onPress: () => navigation.navigate('PhoneNumber') },
                ],
                'warning'
            );
        } else if (error) {
            logger.error('Error getting liked posts:', error);
        }
    }, [error]);

    const handleRefresh = useCallback(() => {
        if (isAuthenticated) refetch();
        else checkAuth();
    }, [isAuthenticated, refetch, checkAuth]);

    const isFirstFocus = useRef(true);
    useFocusEffect(
        useCallback(() => {
            if (isFirstFocus.current) {
                isFirstFocus.current = false;
                return;
            }
            handleRefresh();
        }, [handleRefresh])
    );

    const handleLoadMore = useCallback(() => {
        if (!loadingMore && hasNextPage && isAuthenticated) fetchNextPage();
    }, [loadingMore, hasNextPage, isAuthenticated, fetchNextPage]);

    const handlePostPress = useCallback((post) => {
        navigation.navigate('PostDetailScreen', {
            postId: post.id,
            postType: post.post_type,
            post,
            role: 'customer'
        });
    }, [navigation]);

    // Unsaving drops the row at once; a failure puts the page back as it was.
    const unlike = useToggleLike({
        onMutate: ({ post_id, post_type }) => {
            const previous = qc.getQueryData(LIKED_POSTS_KEY);
            qc.setQueryData(LIKED_POSTS_KEY, (old) => old && ({
                ...old,
                pages: old.pages.map((pg) => ({
                    ...pg,
                    posts: (pg.posts || []).filter((post) => !(post.id === post_id && post.post_type === post_type)),
                })),
            }));
            return previous;
        },
        onRollback: (_vars, previous) => qc.setQueryData(LIKED_POSTS_KEY, previous),
    });
    const handleUnlike = useCallback((item) => {
        unlike.mutate({ post_type: item.post_type, post_id: item.id, liked: true });
    }, [unlike.mutate]);

    const handleBrowsePosts = () => {
        // Nested target — this screen is also registered at the root, where a
        // bare 'AllPosts' (a tab inside CustomerDashboard) doesn't resolve.
        navigation.navigate('CustomerDashboard', { screen: 'AllPosts' });
    };

    const handleLogin = () => {
        navigation.navigate('PhoneNumber');
    };

    const getImageUrl = (item) => {
        const raw = item.imageUrl || item.image_url ||
            (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null);
        return getPostImageUrl(raw);
    };

    const renderPostItem = useCallback(({ item, index }) => (
            // Same two-up grid as CustomerPostList — it is the same card.
            <View style={isTablet && { flex: 1 }}>
            <PostCard
                item={item}
                onPress={handlePostPress}
                imageUri={getImageUrl(item)}
                title={getPostTitle(item, item.post_type || item.category)}
                price={getPostPrice(item)}
                memoKey={`${i18n.language}-${isDark}-${categoryLabel(item.post_type || item.category)}`}
                actions={<LikeButton liked size="small" onToggle={() => handleUnlike(item)} />}
                badges={
                    <Text style={[styles.categoryText, { color: colors.text.secondary }]}>
                        {categoryLabel(item.post_type || item.category)}
                    </Text>
                }
                footer={(
                    <>
                        <View style={styles.locationContainer}>
                            <Ionicons name="location-outline" size={12} color={colors.iconAccent} />
                            <Text style={[styles.locationText, { color: colors.text.secondary }]} numberOfLines={1}>
                                {item.location || t('common.noData')}
                            </Text>
                        </View>
                        <Text style={[styles.likedAtText, { color: colors.text.tertiary }]}>
                            {new Date(item.date_liked).toLocaleDateString()}
                        </Text>
                    </>
                )}
            />
            </View>
    // styles/colors/t must be deps — a stale closure here kept rendering the
    // old palette after a theme switch (and old strings after a locale switch).
    ), [handlePostPress, handleUnlike, styles, colors, t, isAuthenticated, categoryLabel]);

    const renderEmptyState = () => {
        if (!authChecked) {
            return null;
        }

        if (!isAuthenticated) {
            return (
                <EmptyState
                    icon="person-outline"
                    title={t('auth.sessionExpired')}
                    subtitle={t('auth.loginRequired')}
                    actionButton={{ text: t('auth.title'), onPress: handleLogin }}
                />
            );
        }

        // A failed fetch is not an empty shelf — offer a retry, not "browse posts".
        if (isError) {
            return <ScreenError onRetry={refetch} />;
        }

        return (
            <EmptyState
                icon="heart-outline"
                variant="invitation"
                title={t('posts.noSaved')}
                actionButton={{ text: t('posts.browse'), onPress: handleBrowsePosts }}
            />
        );
    };

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color={colors.iconAccent} />
            </View>
        );
    };

    const canGoBack = navigation.canGoBack();
    const showSkeleton = loading;

    const pending = showSkeleton || !authChecked;

    return (
        <ScreenLayout
            title={`${t('posts.savedTitle')}${!pending && posts.length > 0 ? ` (${posts.length})` : ''}`}
            showBack={canGoBack}
            onBack={() => navigation.goBack()}
        >

            <SkeletonCrossfade
                loading={pending}
                skeleton={(
                    <FlatList
                        data={Array(8).fill({})}
                        numColumns={isTablet ? 2 : 1}
                        key={isTablet ? 'tablet-skeleton' : 'phone-skeleton'}
                        columnWrapperStyle={isTablet ? { gap: spacing.md } : undefined}
                        renderItem={() => <View style={isTablet && { flex: 1 }}><SkeletonItem /></View>}
                        keyExtractor={(_, i) => `sk-${i}`}
                        contentContainerStyle={[styles.listContainer, { paddingTop: spacing.md }]}
                        showsVerticalScrollIndicator={false}
                        scrollEnabled={false}
                    />
                )}
            >
            <FlatList
                data={posts}
                renderItem={renderPostItem}
                keyExtractor={(item) => `${item.post_type}-${item.id}`}
                numColumns={isTablet ? 2 : 1}
                key={isTablet ? 'tablet' : 'phone'}
                columnWrapperStyle={isTablet ? { gap: spacing.md } : undefined}
                contentContainerStyle={[

                    styles.listContainer,
                    gStyles.scrollViewContentWithBottomInset(
                        safeAreaHelpers.getBottomSafeArea(insets)
                    ),
                    { paddingTop: spacing.md },
                ]}
                ListEmptyComponent={renderEmptyState}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.1}
                ListFooterComponent={renderFooter}
                showsVerticalScrollIndicator={false}
                initialNumToRender={10}
                maxToRenderPerBatch={4}
                windowSize={5}
                removeClippedSubviews={true}
                updateCellsBatchingPeriod={100}
            />
            </SkeletonCrossfade>
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
    listContainer: {
        padding: spacing.lg,
    },
    categoryText: {
        ...typography.styles.small,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    locationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
        marginRight: spacing.xs,
    },
    locationText: {
        ...typography.styles.small,
        color: colors.text.secondary,
        marginLeft: spacing.xs,
    },
    likedAtText: {
        ...typography.styles.small,
        color: colors.text.tertiary,
        fontStyle: 'italic',
    },
    loadingFooter: {
        paddingVertical: spacing.lg,
        alignItems: 'center',
    },
});

export default CustomerLikeList;