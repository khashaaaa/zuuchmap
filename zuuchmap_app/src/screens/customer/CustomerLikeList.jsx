import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
    View,
    Text,
    FlatList,
    Image,
    RefreshControl,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import { useTranslation } from 'react-i18next';
import likeService from '../../services/api/likeService';
import userService from '../../services/api/userService';
import { getPostImageUrl } from '../../config/api.config';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import LikeButton from '../../components/LikeButton';
import EmptyState from '../../components/EmptyState';
import ScreenError from '../../components/ScreenError';
import { SkeletonItem, SkeletonCrossfade, FadeSlideIn, PressableScale } from '../../components';
import { showErrorModal, isPostLogoutStraggler } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { getPostTitle, normalizePostType, getPostPrice, getSchemaLabel } from '../../utils/postUtils';
import { useCategorySchemas } from '../../hooks/useCategorySchemas';

const CustomerLikeList = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const { t } = useTranslation();

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
        queryKey: ['liked', 'posts'],
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

    const handleUnlike = useCallback((post_id, post_type) => {
        qc.setQueryData(['liked', 'posts'], (old) => old && ({
            ...old,
            pages: old.pages.map((pg) => ({
                ...pg,
                posts: (pg.posts || []).filter((post) => !(post.id === post_id && post.post_type === post_type)),
            })),
        }));
        qc.invalidateQueries({ queryKey: ['liked', 'count'] });
    }, [qc]);

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

    const renderPostItem = useCallback(({ item, index }) => {
        const imageUri = getImageUrl(item);
        return (
        <FadeSlideIn index={index}>
        <PressableScale
            style={[styles.postCard, { backgroundColor: colors.surface }]}
            onPress={() => handlePostPress(item)}
        >
            <View style={styles.imageContainer}>
                {imageUri ? (
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.postImage}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={styles.noImageContainer}>
                        <Ionicons name="image-outline" size={32} color={colors.iconAccent} />
                    </View>
                )}
            </View>

            <View style={styles.postContent}>
                <View style={styles.postHeader}>
                    <Text style={styles.postTitle} numberOfLines={2}>
                        {getPostTitle(item, item.post_type || item.category)}
                    </Text>
                    <LikeButton
                        post_type={item.post_type}
                        post_id={item.id}
                        initial_liked={true}
                        skip_check={true}
                        is_authenticated={isAuthenticated}
                        show_count={false}
                        size="small"
                        onLikeChange={(liked) => {
                            if (!liked) {
                                handleUnlike(item.id, item.post_type);
                            }
                        }}
                    />
                </View>

                <Text style={[styles.categoryText, { color: colors.text.secondary }]}>
                    {categoryLabel(item.post_type || item.category)}
                </Text>

                {getPostPrice(item) && (
                    <Text style={[styles.priceText, { color: colors.text.link }]}>{getPostPrice(item)}</Text>
                )}

                <View style={styles.postFooter}>
                    <View style={styles.locationContainer}>
                        <Ionicons name="location-outline" size={12} color={colors.iconAccent} />
                        <Text style={[styles.locationText, { color: colors.text.secondary }]} numberOfLines={1}>
                            {item.location || t('common.noData')}
                        </Text>
                    </View>
                    <Text style={[styles.likedAtText, { color: colors.text.tertiary }]}>
                        {new Date(item.date_liked).toLocaleDateString()}
                    </Text>
                </View>
            </View>
        </PressableScale>
        </FadeSlideIn>
    );
    // styles/colors/t must be deps — a stale closure here kept rendering the
    // old palette after a theme switch (and old strings after a locale switch).
    }, [handlePostPress, handleUnlike, styles, colors, t, isAuthenticated, categoryLabel]);

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
    const showSkeleton = useMinDisplayTime(loading);

    const pending = showSkeleton || !authChecked;

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader
                title={`${t('posts.savedTitle')}${!pending && posts.length > 0 ? ` (${posts.length})` : ''}`}
                showBack={canGoBack}
                onBack={() => navigation.goBack()}
            />

            <SkeletonCrossfade
                loading={pending}
                skeleton={(
                    <FlatList
                        data={Array(8).fill({})}
                        renderItem={() => <SkeletonItem />}
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
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    listContainer: {
        padding: spacing.lg,
    },
    postCard: {
        ...colors.elevation.md,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        marginBottom: spacing.md,
        overflow: 'hidden',
        flexDirection: 'row',
        // Content-driven height: a 2-line title plus price/footer at the
        // current type scale outgrows any fixed height and gets clipped.
        minHeight: 120,
        borderWidth: 1,
        borderColor: colors.border.light,
    },
    imageContainer: {
        // 96 and border.light, matching CustomerPostList and ProviderPostList —
        // the same post was 4px wider here, on a different placeholder ground.
        width: 96,
        alignSelf: 'stretch',
        overflow: 'hidden',
        backgroundColor: colors.border.light,
    },
    // Absolutely positioned so the image can never dictate the card's height:
    // a percentage height inside a stretch-sized box falls back to the image's
    // intrinsic size (800px seed photos → screen-tall cards).
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
        justifyContent: 'space-between',
    },
    postHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.xs,
    },
    postTitle: {
        ...typography.styles.title,
        color: colors.text.primary,
        flex: 1,
        marginRight: spacing.sm,
    },
    categoryText: {
        ...typography.styles.small,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    priceText: {
        ...typography.styles.price,
        color: colors.text.link,
        marginBottom: spacing.xs,
    },
    postFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    locationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
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