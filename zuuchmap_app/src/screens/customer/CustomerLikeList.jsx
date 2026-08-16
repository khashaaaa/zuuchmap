import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
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
import { spacing, typography, shadows, safeAreaHelpers, radius, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import { useTranslation } from 'react-i18next';
import likeService from '../../services/api/likeService';
import userService from '../../services/api/userService';
import { API_CONFIG, getPostImageUrl } from '../../config/api.config';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import LikeButton from '../../components/LikeButton';
import EmptyState from '../../components/EmptyState';
import { SkeletonItem, FadeSlideIn } from '../../components';
import { showErrorModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { getFixedImageUrl, getPostTitle, normalizePostType, getPostPrice } from '../../utils/postUtils';

const CustomerLikeList = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
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
        fetchNextPage, hasNextPage, isFetchingNextPage: loadingMore, error,
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
        if (status === 401 || status === 403) {
            setIsAuthenticated(false);
            showErrorModal(
                t('auth.sessionExpired'),
                t('auth.sessionExpiredDesc'),
                [
                    { text: t('common.close') },
                    { text: t('auth.title'), onPress: () => navigation.navigate('Login') },
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
    }, [qc]);

    const handleBrowsePosts = () => {
        navigation.navigate('AllPosts');
    };

    const handleLogin = () => {
        navigation.navigate('Login');
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
        <TouchableOpacity
            style={[styles.post_card, { backgroundColor: colors.surface }]}
            onPress={() => handlePostPress(item)}
            activeOpacity={interactions.activeOpacity}
        >
            <View style={styles.image_container}>
                {imageUri ? (
                    <Image
                        source={{ uri: imageUri }}
                        style={[styles.post_image, { backgroundColor: colors.background }]}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={[styles.no_image_container, { backgroundColor: colors.background }]}>
                        <Ionicons name="image-outline" size={32} color={colors.primary} />
                    </View>
                )}
            </View>

            <View style={styles.post_content}>
                <View style={styles.post_header}>
                    <Text style={styles.post_title} numberOfLines={2}>
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

                <Text style={[styles.category_text, { color: colors.text.secondary }]}>
                    {t('category.' + normalizePostType(item.post_type || item.category))}
                </Text>

                {getPostPrice(item) && (
                    <Text style={[styles.price_text, { color: colors.primary }]}>{getPostPrice(item)}</Text>
                )}

                <View style={styles.post_footer}>
                    <View style={styles.location_container}>
                        <Ionicons name="location-outline" size={12} color={colors.primary} />
                        <Text style={[styles.location_text, { color: colors.text.secondary }]} numberOfLines={1}>
                            {item.location || t('common.noData')}
                        </Text>
                    </View>
                    <Text style={[styles.liked_at_text, { color: colors.text.tertiary }]}>
                        {new Date(item.date_liked).toLocaleDateString()}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
        </FadeSlideIn>
    );
    }, [handlePostPress, handleUnlike]);

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

        return (
            <EmptyState
                icon="heart-outline"
                title={t('posts.noSaved')}
                actionButton={{ text: t('posts.browse'), onPress: handleBrowsePosts }}
            />
        );
    };

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.loading_footer}>
                <ActivityIndicator size="small" color={colors.primary} />
            </View>
        );
    };

    const canGoBack = navigation.canGoBack();
    const showSkeleton = useMinDisplayTime(loading);

    if (showSkeleton || !authChecked) {
        return (
            <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
                <ScreenHeader
                    title={t('posts.savedTitle')}
                    showBack={canGoBack}
                    onBack={() => navigation.goBack()}
                />
                <FlatList
                    data={Array(8).fill({})}
                    renderItem={() => <SkeletonItem />}
                    keyExtractor={(_, i) => `sk-${i}`}
                    contentContainerStyle={[styles.list_container, { paddingTop: spacing.md }]}
                    showsVerticalScrollIndicator={false}
                />
            </CustomSafeAreaView>
        );
    }

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader
                title={`${t('posts.savedTitle')}${posts.length > 0 ? ` (${posts.length})` : ''}`}
                showBack={canGoBack}
                onBack={() => navigation.goBack()}
            />

            <FlatList
                data={posts}
                renderItem={renderPostItem}
                keyExtractor={(item) => `${item.post_type}-${item.id}`}
                contentContainerStyle={[
                    styles.list_container,
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
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    list_container: {
        padding: spacing.lg,
    },
    post_card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        marginBottom: spacing.md,
        overflow: 'hidden',
        flexDirection: 'row',
        height: 120,
        borderWidth: 1,
        borderColor: colors.border.light,
        ...shadows.medium,
    },
    image_container: {
        width: 100,
        height: 120,
    },
    post_image: {
        width: '100%',
        height: '100%',
        backgroundColor: colors.background,
    },
    no_image_container: {
        width: '100%',
        height: '100%',
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    post_content: {
        flex: 1,
        padding: spacing.md,
        justifyContent: 'space-between',
    },
    post_header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.xs,
    },
    post_title: {
        fontSize: typography.md,
        fontWeight: 'bold',
        color: colors.text.primary,
        flex: 1,
        marginRight: spacing.sm,
        lineHeight: 18,
    },
    category_text: {
        fontSize: typography.xs,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    price_text: {
        fontSize: typography.sm,
        fontWeight: '600',
        color: colors.primary,
        marginBottom: spacing.xs,
    },
    post_footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    location_container: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: spacing.xs,
    },
    location_text: {
        fontSize: typography.xs,
        color: colors.text.secondary,
        marginLeft: spacing.xs,
    },
    liked_at_text: {
        fontSize: typography.xs,
        color: colors.text.tertiary,
        fontStyle: 'italic',
    },
    loading_footer: {
        paddingVertical: spacing.lg,
        alignItems: 'center',
    },
});

export default CustomerLikeList;