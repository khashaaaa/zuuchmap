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
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, animations } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import postService from '../../services/api/postService';
import userService from '../../services/api/userService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import PressableScale from '../../components/PressableScale';
import NotificationBell from '../../components/NotificationBell';
import { CategoryBadge, StatusBadge, SkeletonItem, EmptyState, FadeSlideIn } from '../../components';
import ScreenError from '../../components/ScreenError';
import { getPriceUnitLabel, formatPrice, formatDateYYYYMMDD } from '../../utils/displayUtils';
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
                        <Ionicons name="image-outline" size={28} color={colors.primary} />
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
                        hitSlop={interactions.hitSlop}
                    >
                        {isLoading
                            ? <ActivityIndicator size="small" color={colors.primary} />
                            : <Ionicons name="ellipsis-vertical" size={18} color={colors.text.tertiary} />
                        }
                    </TouchableOpacity>
                </View>

                <CategoryBadge postType={item.postType} showIcon={true} />

                {item.approval_status === 'PENDING' && (
                    <View style={styles.approvalBadgePending}>
                        <Text style={[styles.approvalBadgeText, { color: colors.warning }]}>{t('posts.approval.pending')}</Text>
                    </View>
                )}
                {item.approval_status === 'REJECTED' && (
                    <View style={styles.approvalBadgeRejected}>
                        <Text style={[styles.approvalBadgeText, { color: colors.danger }]}>{t('posts.approval.rejected')}</Text>
                        {item.rejection_reason && (
                            <Text style={styles.rejectionReason} numberOfLines={2}>{item.rejection_reason}</Text>
                        )}
                    </View>
                )}

                {(item.price_amount || item.price) && (
                    <Text style={styles.postPrice}>
                        {item.price_amount ? formatPrice(item.price_amount, item.price_unit) : item.price}
                    </Text>
                )}

                <Text style={styles.postDate}>
                    {item.date_created ? formatDateYYYYMMDD(item.date_created) : ''}
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
        prevProps.colors === nextProps.colors
    );
});

const ProviderPostList = ({ navigation }) => {
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [isLoading, setIsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [imageErrors, setImageErrors] = useState({});

    const { data: queryData, isLoading: queryLoadingRaw, isError: queryError, refetch } = useQuery({
        queryKey: ['provider', 'mine'],
        queryFn: () => postService.getMine(),
        staleTime: 0,
    });
    const queryLoading = useMinDisplayTime(queryLoadingRaw);

    const posts = useMemo(() => {
        const raw = Array.isArray(queryData?.data)
            ? queryData.data
            : (queryData?.data?.posts ?? []);
        return raw.map(p => ({ ...p, postType: p.category, post_type: p.category }));
    }, [queryData]);


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
                                showErrorModal(t('common.error'), t('posts.deleteError'));
                            }
                        }
                    }
                }
            ]
        );
    }, [refetch, handleAuthError, t]);

    const stats = useMemo(() => ({
        active: posts.filter(p => p.approval_status?.toUpperCase() === 'APPROVED' && p.status?.toUpperCase() === 'ACTIVE').length,
        views: posts.reduce((s, p) => s + (p.views || 0), 0),
    }), [posts]);

    const renderStatsRow = useCallback(() => {
        if (posts.length === 0) return null;
        return (
            <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.statValue, { color: colors.success }]}>{stats.active}</Text>
                    <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('posts.stats.active')}</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.statValue, { color: colors.primary }]}>{stats.views.toLocaleString()}</Text>
                    <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('posts.stats.totalViews')}</Text>
                </View>
            </View>
        );
    }, [posts.length, stats, colors, t]);

    const getPostTitleWrapped = useCallback(
        (item) => getPostTitle(item, item.postType),
        []
    );

    const renderPostItem = useCallback(({ item, index }) => (
        <FadeSlideIn index={index}>
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
        />
        </FadeSlideIn>
    ), [handlePostPress, handleEditPost, handleDeletePost, imageErrors, isLoading, getPostTitleWrapped, colors, t]);

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
                    ListHeaderComponent={renderStatsRow}
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
        color: colors.primary,
    },
    postDate: {
        ...typography.styles.small,
        color: colors.text.tertiary,
    },
    approvalBadgePending: {
        alignSelf: 'flex-start',
        backgroundColor: colors.opacity.background.warning,
        borderColor: colors.opacity.border.warning,
        borderWidth: 1,
        borderRadius: radius.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },
    approvalBadgeRejected: {
        alignSelf: 'flex-start',
        backgroundColor: colors.opacity.background.danger,
        borderColor: colors.opacity.border.danger,
        borderWidth: 1,
        borderRadius: radius.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        maxWidth: '100%',
    },
    approvalBadgeText: {
        ...typography.styles.badge,
    },
    rejectionReason: {
        ...typography.styles.small,
        color: colors.danger,
        marginTop: spacing.xs,
    },
    statsRow: {
        flexDirection: 'row',
        marginBottom: spacing.lg,
        gap: spacing.sm,
    },
    statCard: {
        ...colors.elevation.sm,
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
    statValue: {
        ...typography.styles.h2,
        marginBottom: spacing.xxs,
    },
    statLabel: {
        ...typography.styles.caption,
        color: colors.text.secondary,
    },
});

export default ProviderPostList;
