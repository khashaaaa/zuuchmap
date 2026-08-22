import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    ScrollView,
    Image,
    RefreshControl,
    TextInput,
    Platform,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import postService from '../../services/api/postService';
import categoryService from '../../services/api/categoryService';
import { getPostImageUrl } from '../../config/api.config';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import LikeButton from '../../components/LikeButton';
import { CategoryBadge, StatusBadge, SkeletonItem, EmptyState, LocationRow, FadeSlideIn, Button, SelectionPop } from '../../components';
import ScreenError from '../../components/ScreenError';
import SearchInput from '../../components/SearchInput';
import BottomSheetModal from '../../components/BottomSheetModal';
import PressableScale from '../../components/PressableScale';
import { getFixedImageUrl, getPostPrice, getPostImage, getPostTitle as getPostTitleUtil, getSearchableText, categoryToPostType, getSchemaLabel } from '../../utils/postUtils';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import { showErrorAlert, getErrorMessage } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import likeService from '../../services/api/likeService';
import userService from '../../services/api/userService';
import NotificationBell from '../../components/NotificationBell';

const SORT_OPTIONS = [
    { value: '' },
    { value: 'price_asc' },
    { value: 'price_desc' },
    { value: 'views' },
];

// Mirrors the engine's Status enum (ACTIVE/RENTED; EXPIRED is filtered out server-side)
const STATUS_OPTIONS = [
    { value: '' },
    { value: 'active' },
    { value: 'rented' },
];

const PostItem = React.memo(({
    item,
    onPress,
    getPostTitle,
    getPostPrice,
    getPostImage,
    getFixedImageUrl,
    is_liked = false,
    is_authenticated = false,
    onLikeChange,
    colors,
    showLike = true,
    emphasized = false,
    emphasisLabel = '',
}) => {
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [imageError, setImageError] = useState(false);

    const title = getPostTitle(item);
    const price = getPostPrice(item);
    const imageUri = getPostImage(item);
    const handleImageError = useCallback(() => setImageError(true), []);
    const handlePress = useCallback(() => onPress(item), [item, onPress]);

    return (
        <PressableScale
            style={[styles.postCard, { backgroundColor: colors.surface }, emphasized && styles.emphasizedCard]}
            onPress={handlePress}
            accessibilityRole="button"
        >
            <View style={[styles.imageContainer, { backgroundColor: colors.border.light }]}>
                {imageUri && !imageError ? (
                    <Image
                        source={{ uri: getFixedImageUrl(imageUri) }}
                        style={styles.postImage}
                        onError={handleImageError}
                        fadeDuration={200}
                    />
                ) : (
                    <View style={styles.noImageContainer}>
                        <Ionicons name="image-outline" size={28} color={colors.primary} />
                    </View>
                )}
                {item.status && (
                    <StatusBadge
                        status={item.status}
                        variant="default"
                        position="absolute"
                        showIndicator={false}
                    />
                )}
                {emphasized && (
                    <View style={styles.emphasizedBadge}>
                        <Text style={styles.emphasizedBadgeText} numberOfLines={1}>{emphasisLabel}</Text>
                    </View>
                )}
            </View>

            <View style={styles.postContent}>
                <View style={styles.postHeader}>
                    <Text style={styles.postTitle} numberOfLines={2}>{title}</Text>
                    {showLike && (
                        <LikeButton
                            post_type={item.post_type || 'construction'}
                            post_id={item.id}
                            initial_liked={is_liked}
                            skip_check={true}
                            is_authenticated={is_authenticated}
                            show_count={false}
                            size="small"
                            onLikeChange={onLikeChange}
                        />
                    )}
                </View>

                <CategoryBadge
                    postType={item.post_type || 'construction'}
                    showIcon={true}
                />

                {price && (
                    <Text style={styles.postPrice}>{price}</Text>
                )}

                <View style={styles.postFooter}>
                    <LocationRow
                        location={item.location}
                        address={item.address}
                        province={item.province}
                        district={item.district}
                        containerStyle={styles.locationRow}
                    />
                    {item.date_created && (
                        <Text style={styles.postDate}>
                            {new Date(item.date_created).toLocaleDateString('mn-MN')}
                        </Text>
                    )}
                </View>
            </View>
        </PressableScale>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.item.id === nextProps.item.id &&
        prevProps.item.status === nextProps.item.status &&
        prevProps.item.date_created === nextProps.item.date_created &&
        prevProps.is_liked === nextProps.is_liked &&
        prevProps.is_authenticated === nextProps.is_authenticated &&
        prevProps.showLike === nextProps.showLike &&
        prevProps.colors === nextProps.colors
    );
});

const CustomerPostList = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t, i18n } = useTranslation();
    const insets = useSafeAreaInsets();

    // Route params are optional — when used as a tab component (CustomerDashboard),
    // route.params may be undefined. When navigated to from SubcategorySelectScreen,
    // category/subcategory are provided.
    const {
        category: routeCategory,
        subcategory: routeSubcategory,
        categoryDisplayName,
        subcategoryDisplayName,
    } = route?.params || {};

    // isFilterMode: navigated to with a category (from SubcategorySelectScreen)
    // isBrowseMode: used as a tab, show all posts with filter modal
    const isFilterMode = Boolean(routeCategory);

    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [likedPostsStatus, setLikedPostsStatus] = useState({});
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isCustomer, setIsCustomer] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        category: routeCategory || '',
        subcategory: routeSubcategory || '',
        priceMin: '',
        priceMax: '',
        sort: '',
        location: '',
        status: isFilterMode ? '' : 'active',
    });

    const bottomPadding = useMemo(() => {
        const tabBarHeight = Platform.OS === 'ios' ? 88 : 65;
        const safeAreaBottom = safeAreaHelpers.getBottomSafeArea(insets);
        return Math.max(tabBarHeight + safeAreaBottom, spacing.xl + 80);
    }, [insets]);

    // --- Data fetching ---

    // Filter mode: fetch by specific post type
    const getPostType = useMemo(() => (isFilterMode ? categoryToPostType(routeCategory) : null), [isFilterMode, routeCategory]);

    const { data: categoryPosts = [], isLoading: categoryLoading, isError: categoryError, error: categoryErrorObj, refetch: refetchCategory } = useQuery({
        queryKey: ['posts', 'list', getPostType, routeSubcategory || 'all'],
        queryFn: async () => {
            const response = await postService.getList({ category: getPostType, approval_status: 'APPROVED' });
            const postsData = Array.isArray(response.data) ? response.data : [];
            let filteredData = postsData;
            if (routeSubcategory) {
                filteredData = postsData.filter(post =>
                    post.subcategory === routeSubcategory
                );
            }
            return filteredData.map(post => {
                getSearchableText(post);
                return { ...post, post_type: post.category };
            });
        },
        staleTime: 10 * 60 * 1000,
        enabled: isFilterMode,
    });

    // Browse mode: fetch all posts (with optional server-side full-text search)
    const { data: allPosts = [], isLoading: allLoading, isError: allError, error: allErrorObj, refetch: refetchAll } = useQuery({
        queryKey: ['posts', 'all', 'approved', debouncedSearchQuery],
        queryFn: async () => {
            const response = await postService.getList({
                approval_status: 'APPROVED',
                q: debouncedSearchQuery.trim() || undefined,
            });
            const combinedPosts = (Array.isArray(response?.data) ? response.data : []).map(post => {
                const processedPost = {
                    ...post,
                    post_type: post.category,
                    imageUrl: getPostImageUrl(post.images?.[0]),
                };
                getSearchableText(processedPost);
                return processedPost;
            });
            combinedPosts.sort((a, b) => new Date(b.date_created || b.created_at) - new Date(a.date_created || a.created_at));
            return combinedPosts;
        },
        staleTime: 30_000,
        enabled: !isFilterMode,
    });

    const posts = isFilterMode ? categoryPosts : allPosts;
    const loadingRaw = isFilterMode ? categoryLoading : allLoading;
    const loading = useMinDisplayTime(loadingRaw);
    const isError = isFilterMode ? categoryError : allError;
    const errorObj = isFilterMode ? categoryErrorObj : allErrorObj;

    // Browse mode: fetch live category list for the pill row
    const { data: categorySchemas = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoryService.getCategories(true),
        staleTime: 5 * 60 * 1000,
    });

    // "All" plus whatever the admin has active — no build-time category list.
    const categoryOptions = useMemo(() => [
        { value: '', label: t('filter.allCategories') },
        ...categorySchemas
            .filter((c) => c.active !== false)
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((c) => ({ value: c.key, label: getSchemaLabel(c) })),
    ], [categorySchemas, t]);

    useEffect(() => {
        if (isError) {
            logger.warn('Could not load posts');
            showErrorAlert(t('common.error'), errorObj);
        }
    }, [isError, errorObj, t]);

    useEffect(() => {
        userService.isAuthenticated().then(authStatus => {
            const authenticated = authStatus?.authenticated ?? false;
            setIsAuthenticated(authenticated);
            setIsCustomer(authenticated && !authStatus?.is_admin && authStatus?.userType === 'CUSTOMER');
        }).catch(() => {});
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (posts.length === 0 || !isAuthenticated) return;
            likeService.batchCheckLiked(posts).then(setLikedPostsStatus).catch(() => {});
        }, [posts, isAuthenticated])
    );

    // --- Filtering ---

    const filteredPosts = useMemo(() => {
        const query = debouncedSearchQuery.trim().toLowerCase();

        if (isFilterMode) {
            // Filter mode: text search is client-side (category/subcategory already baked in)
            if (!query) return posts;
            return posts.filter(post => getSearchableText(post).includes(query));
        }

        // Browse mode: text search is server-side (?q=); apply remaining local filters only
        const locationQuery = filters.location?.toLowerCase();
        const statusUpper = filters.status?.toUpperCase();

        const priceMin = Number(filters.priceMin);
        const priceMax = Number(filters.priceMax);
        const hasMin = filters.priceMin !== '' && !Number.isNaN(priceMin);
        const hasMax = filters.priceMax !== '' && !Number.isNaN(priceMax);

        const result = posts.filter(post => {
            if (filters.category && post.post_type !== filters.category) return false;
            if (hasMin || hasMax) {
                const price = Number(post.price_amount);
                if (!price) return false;
                if (hasMin && price < priceMin) return false;
                if (hasMax && price > priceMax) return false;
            }
            if (locationQuery) {
                const loc = [post.location, post.address, post.province, post.district]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!loc.includes(locationQuery)) return false;
            }
            if (statusUpper) {
                const postStatus = post.status?.toUpperCase() ?? 'ACTIVE';
                if (statusUpper === 'ACTIVE' ? postStatus !== 'ACTIVE' : postStatus !== statusUpper) return false;
            }
            return true;
        });

        // Unpriced posts sink to the bottom of price sorts so "cheapest" never means "no price"
        if (filters.sort === 'price_asc' || filters.sort === 'price_desc') {
            const dir = filters.sort === 'price_asc' ? 1 : -1;
            result.sort((a, b) => {
                const pa = Number(a.price_amount) || null;
                const pb = Number(b.price_amount) || null;
                if (pa === null && pb === null) return 0;
                if (pa === null) return 1;
                if (pb === null) return -1;
                return (pa - pb) * dir;
            });
        } else if (filters.sort === 'views') {
            result.sort((a, b) => (b.views || 0) - (a.views || 0));
        }
        return result;
    }, [isFilterMode, posts, debouncedSearchQuery, filters]);

    // --- Callbacks ---

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (isFilterMode) {
            await refetchCategory();
        } else {
            await refetchAll();
        }
        setRefreshing(false);
    }, [isFilterMode, refetchCategory, refetchAll]);

    const handlePostPress = useCallback((post) => {
        navigation.navigate('PostDetailScreen', {
            postId: post.id,
            postType: post.post_type || getPostType,
            post,
            role: 'customer',
            shouldIncrementViews: true,
        });
    }, [navigation, getPostType]);

    const getPostTitleMemo = useCallback((post) => getPostTitleUtil(post, post.post_type), []);

    const getPostPriceMemo = useCallback((post) => getPostPrice(post), []);

    const getPostImageMemo = useCallback((post) => getPostImage(post), []);

    const clearFilters = useCallback(() => {
        setFilters({
            category: isFilterMode ? (routeCategory || '') : '',
            subcategory: isFilterMode ? (routeSubcategory || '') : '',
            priceMin: '',
            priceMax: '',
            sort: '',
            location: '',
            status: '',
        });
        setSearchQuery('');
    }, [isFilterMode, routeCategory, routeSubcategory]);

    const activeFiltersCount = useMemo(() => {
        if (isFilterMode) return searchQuery ? 1 : 0;
        const nonDefaultFilters = {
            ...filters,
            sort: '', // an ordering, not a filter — the badge counts narrowing only
            status: filters.status === 'active' ? '' : filters.status,
        };
        return Object.values(nonDefaultFilters).filter(v => v && v !== '').length + (searchQuery ? 1 : 0);
    }, [isFilterMode, filters, searchQuery]);

    // --- Render helpers ---

    const handleLikeChange = useCallback((post_key, liked) => {
        setLikedPostsStatus(prev => ({ ...prev, [post_key]: liked }));
    }, []);

    // Emphasis is an admin-set schema flag (CategorySchema.emphasized) — no hardcoded category keys
    const emphasisByKey = useMemo(() => {
        const map = {};
        for (const c of categorySchemas) {
            if (c.emphasized) map[c.key] = getSchemaLabel(c);
        }
        return map;
    // i18n.language: emphasis labels must recompute when the locale switches.
    }, [categorySchemas, i18n.language]);

    const renderPostItem = useCallback(({ item, index }) => {
        const post_key = `${item.post_type || 'construction'}-${item.id}`;
        return (
            <FadeSlideIn index={index}>
                <PostItem
                    item={item}
                    onPress={handlePostPress}
                    getPostTitle={getPostTitleMemo}
                    getPostPrice={getPostPriceMemo}
                    getPostImage={getPostImageMemo}
                    getFixedImageUrl={getFixedImageUrl}
                    is_liked={likedPostsStatus[post_key] || false}
                    is_authenticated={isCustomer}
                    onLikeChange={(liked) => handleLikeChange(post_key, liked)}
                    showLike={isCustomer}
                    colors={colors}
                    emphasized={!!emphasisByKey[item.post_type]}
                    emphasisLabel={emphasisByKey[item.post_type] || ''}
                />
            </FadeSlideIn>
        );
    }, [handlePostPress, getPostTitleMemo, getPostPriceMemo, getPostImageMemo, likedPostsStatus, isAuthenticated, handleLikeChange, colors, emphasisByKey]);

    const keyExtractor = useCallback((item) => item.id.toString(), []);

    const renderHeader = useCallback(() => {
        if (!isFilterMode) return null;
        return (
            <View style={styles.headerInfo}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                <View style={styles.headerTextContainer}>
                    <Text style={styles.categoryText}>
                        {categoryDisplayName} → {subcategoryDisplayName}
                    </Text>
                    <Text style={styles.resultCount}>
                        {t('filter.resultsFound', { count: filteredPosts.length })}
                        {searchQuery && ` "${searchQuery}"`}
                    </Text>
                </View>
            </View>
        );
    }, [isFilterMode, categoryDisplayName, subcategoryDisplayName, filteredPosts.length, searchQuery, t]);

    const refetchActive = isFilterMode ? refetchCategory : refetchAll;

    const renderEmptyState = useCallback(() => {
        if (isError) {
            // Broken must not look like empty — siblings use ScreenError for fetch failures.
            return (
                <ScreenError
                    icon="cloud-offline-outline"
                    message={getErrorMessage(errorObj)}
                    onRetry={refetchActive}
                />
            );
        }
        return (
            <EmptyState
                icon={searchQuery || activeFiltersCount > 0 ? 'search' : 'document-outline'}
                title={searchQuery || activeFiltersCount > 0 ? t('filter.searchNoResults') : t('posts.notFound')}
                subtitle={searchQuery || activeFiltersCount > 0
                    ? t('filter.searchNoResultsDesc')
                    : t('posts.browseEmpty')}
                variant={searchQuery || activeFiltersCount > 0 ? 'search' : 'default'}
                actionButton={(searchQuery || activeFiltersCount > 0) ? {
                    text: t('filter.clearAll'),
                    icon: 'close-circle',
                    onPress: clearFilters,
                } : undefined}
            />
        );
    }, [isError, errorObj, refetchActive, searchQuery, activeFiltersCount, clearFilters, t]);

    const renderFilterModal = () => {
        if (isFilterMode) return null;
        return (
            <BottomSheetModal
                visible={showFilters}
                onClose={() => setShowFilters(false)}
                title={t('filter.title')}
                footer={
                    <View style={styles.modalFooterButtons}>
                        <Button
                            title={t('common.clear')}
                            onPress={clearFilters}
                            variant="outline"
                            size="medium"
                            style={styles.modalFooterButton}
                        />
                        <Button
                            title={t('common.apply')}
                            onPress={() => setShowFilters(false)}
                            variant="primary"
                            size="medium"
                            style={styles.modalFooterButton}
                        />
                    </View>
                }
            >
                <View style={styles.filterSection}>
                    <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.category')}</Text>
                    <View style={styles.filterOptionsContainer}>
                        {categoryOptions.map((cat) => (
                            <SelectionPop key={cat.value} selected={filters.category === cat.value}>
                                <TouchableOpacity
                                    style={[
                                        styles.filterOption,
                                        filters.category === cat.value && styles.filterOptionActive,
                                    ]}
                                    onPress={() => setFilters(prev => ({ ...prev, category: cat.value }))}
                                    activeOpacity={interactions.activeOpacity}
                                >
                                    <Text style={[
                                        styles.filterOptionText,
                                        filters.category === cat.value && styles.filterOptionTextActive,
                                    ]}>
                                        {cat.label}
                                    </Text>
                                </TouchableOpacity>
                            </SelectionPop>
                        ))}
                    </View>
                </View>

                <View style={styles.filterSection}>
                    <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.sortBy')}</Text>
                    <View style={styles.filterOptionsContainer}>
                        {SORT_OPTIONS.map((opt) => (
                            <SelectionPop key={opt.value} selected={filters.sort === opt.value}>
                                <TouchableOpacity
                                    style={[
                                        styles.filterOption,
                                        filters.sort === opt.value && styles.filterOptionActive,
                                    ]}
                                    onPress={() => setFilters(prev => ({ ...prev, sort: opt.value }))}
                                    activeOpacity={interactions.activeOpacity}
                                >
                                    <Text style={[
                                        styles.filterOptionText,
                                        filters.sort === opt.value && styles.filterOptionTextActive,
                                    ]}>
                                        {t(`sort.${opt.value || 'newest'}`)}
                                    </Text>
                                </TouchableOpacity>
                            </SelectionPop>
                        ))}
                    </View>
                </View>

                <View style={styles.filterSection}>
                    <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.priceRange')}</Text>
                    <View style={styles.priceRangeRow}>
                        <TextInput
                            style={[styles.locationInput, styles.priceRangeInput, {
                                backgroundColor: colors.background,
                                borderColor: colors.border.light,
                                color: colors.text.primary,
                            }]}
                            value={filters.priceMin}
                            onChangeText={(text) => setFilters(prev => ({ ...prev, priceMin: text.replace(/[^0-9]/g, '') }))}
                            placeholder={t('filter.minPrice')}
                            placeholderTextColor={colors.text.placeholder}
                            keyboardType="number-pad"
                        />
                        <TextInput
                            style={[styles.locationInput, styles.priceRangeInput, {
                                backgroundColor: colors.background,
                                borderColor: colors.border.light,
                                color: colors.text.primary,
                            }]}
                            value={filters.priceMax}
                            onChangeText={(text) => setFilters(prev => ({ ...prev, priceMax: text.replace(/[^0-9]/g, '') }))}
                            placeholder={t('filter.maxPrice')}
                            placeholderTextColor={colors.text.placeholder}
                            keyboardType="number-pad"
                        />
                    </View>
                </View>

                <View style={styles.filterSection}>
                    <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.status')}</Text>
                    <View style={styles.filterOptionsContainer}>
                        {STATUS_OPTIONS.map((status) => (
                            <SelectionPop key={status.value} selected={filters.status === status.value}>
                                <TouchableOpacity
                                    style={[
                                        styles.filterOption,
                                        filters.status === status.value && styles.filterOptionActive,
                                    ]}
                                    onPress={() => setFilters(prev => ({ ...prev, status: status.value }))}
                                    activeOpacity={interactions.activeOpacity}
                                >
                                    <Text style={[
                                        styles.filterOptionText,
                                        filters.status === status.value && styles.filterOptionTextActive,
                                    ]}>
                                        {status.value ? t(`status.${status.value}`, { defaultValue: status.value }) : t('filter.allStatuses')}
                                    </Text>
                                </TouchableOpacity>
                            </SelectionPop>
                        ))}
                    </View>
                </View>

                <View style={styles.filterSection}>
                    <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.location')}</Text>
                    <TextInput
                        style={[styles.locationInput, {
                            backgroundColor: colors.background,
                            borderColor: colors.border.light,
                            color: colors.text.primary,
                        }]}
                        value={filters.location}
                        onChangeText={(text) => setFilters(prev => ({ ...prev, location: text }))}
                        placeholder={t('common.locationSearch')}
                        placeholderTextColor={colors.text.placeholder}
                    />
                </View>
            </BottomSheetModal>
        );
    };

    // --- Category pills (browse mode only) ---

    const renderCategoryPills = useCallback(() => {
        if (isFilterMode || categorySchemas.length === 0) return null;
        return (
            <View style={[styles.pillsWrapper, { backgroundColor: colors.surface, borderBottomColor: colors.border.light }]}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pillsContainer}
                >
                    <SelectionPop selected={!filters.category}>
                        <TouchableOpacity
                            style={[
                                styles.pill,
                                { borderColor: colors.border.medium, backgroundColor: colors.background },
                                !filters.category && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                            onPress={() => setFilters(prev => ({ ...prev, category: '' }))}
                            activeOpacity={interactions.activeOpacity}
                            hitSlop={{ top: 6, bottom: 6 }}
                        >
                            <Text style={[
                                styles.pillText,
                                { color: colors.text.primary },
                                !filters.category && { ...typography.styles.labelStrong, color: colors.onPrimary },
                            ]}>
                                {t('filter.allCategories')}
                            </Text>
                        </TouchableOpacity>
                    </SelectionPop>
                    {categorySchemas.map((cat) => {
                        const isActive = filters.category === cat.key;
                        return (
                            <SelectionPop key={cat.key} selected={isActive}>
                                <TouchableOpacity
                                    style={[
                                        styles.pill,
                                        { borderColor: colors.border.medium, backgroundColor: colors.background },
                                        isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setFilters(prev => ({ ...prev, category: isActive ? '' : cat.key }))}
                                    activeOpacity={interactions.activeOpacity}
                                    hitSlop={{ top: 6, bottom: 6 }}
                                >
                                    <Text style={[
                                        styles.pillText,
                                        { color: colors.text.primary },
                                        isActive && { ...typography.styles.labelStrong, color: colors.onPrimary },
                                    ]}>
                                        {t(`category.${cat.key}`, { defaultValue: cat.label || cat.key })}
                                    </Text>
                                </TouchableOpacity>
                            </SelectionPop>
                        );
                    })}
                </ScrollView>
            </View>
        );
    }, [isFilterMode, categorySchemas, filters.category, colors, t]);

    // --- Header config ---

    const headerRight = <NotificationBell />;

    // --- Loading skeleton ---

    if (loading && posts.length === 0) {
        return (
            <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
                <ScreenHeader
                    title={t('posts.browseTitle')}
                    showBack={isFilterMode}
                    onBack={isFilterMode ? () => navigation.goBack() : undefined}
                    rightComponent={headerRight}
                />
                <View style={styles.searchRow}>
                    <View style={styles.searchFlex}>
                        <SearchInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder={t('filter.searchPlaceholder')}
                            containerStyle={{ padding: 0 }}
                        />
                    </View>
                    {!isFilterMode && (
                        <TouchableOpacity
                            onPress={() => setShowFilters(true)}
                            style={[
                                styles.filterRowBtn,
                                {
                                    backgroundColor: activeFiltersCount > 0 ? colors.opacity.background.primary : colors.surface,
                                    borderColor: activeFiltersCount > 0 ? colors.primary : colors.border.light,
                                },
                            ]}
                            activeOpacity={interactions.activeOpacity}
                        >
                            <Ionicons name="options-outline" size={20} color={activeFiltersCount > 0 ? colors.primary : colors.text.secondary} />
                            {activeFiltersCount > 0 && (
                                <View style={styles.filterBadge}>
                                    <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
                {renderCategoryPills()}
                <FlatList
                    data={Array(12).fill({})}
                    renderItem={() => <SkeletonItem />}
                    keyExtractor={(_, index) => `skeleton-${index}`}
                    contentContainerStyle={[
                        styles.listContainer,
                        isFilterMode
                            ? gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets))
                            : { paddingBottom: bottomPadding, paddingTop: spacing.md },
                    ]}
                    showsVerticalScrollIndicator={false}
                />
            </CustomSafeAreaView>
        );
    }

    // --- Main render ---

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader
                title={t('posts.browseTitle')}
                showBack={isFilterMode}
                onBack={isFilterMode ? () => navigation.goBack() : undefined}
                rightComponent={headerRight}
            />

            <View style={styles.searchRow}>
                <View style={styles.searchFlex}>
                    <SearchInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={t('filter.searchPlaceholder')}
                        containerStyle={{ padding: 0 }}
                    />
                </View>
                {!isFilterMode && (
                    <TouchableOpacity
                        onPress={() => setShowFilters(true)}
                        style={[
                            styles.filterRowBtn,
                            {
                                backgroundColor: activeFiltersCount > 0 ? colors.opacity.background.primary : colors.surface,
                                borderColor: activeFiltersCount > 0 ? colors.primary : colors.border.light,
                            },
                        ]}
                        activeOpacity={interactions.activeOpacity}
                    >
                        <Ionicons name="options-outline" size={20} color={activeFiltersCount > 0 ? colors.primary : colors.text.secondary} />
                        {activeFiltersCount > 0 && (
                            <View style={styles.filterBadge}>
                                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}
            </View>

            {renderCategoryPills()}

            <FlatList
                data={filteredPosts}
                renderItem={renderPostItem}
                keyExtractor={keyExtractor}
                numColumns={isTablet ? 2 : 1}
                key={isTablet ? 'tablet' : 'phone'}
                columnWrapperStyle={isTablet ? { gap: spacing.md } : undefined}
                contentContainerStyle={[
                    styles.listContainer,
                    isFilterMode
                        ? gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets))
                        : { paddingBottom: bottomPadding, paddingTop: spacing.md },
                ]}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={renderEmptyState}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
                showsVerticalScrollIndicator={false}
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={10}
                removeClippedSubviews={true}
                updateCellsBatchingPeriod={100}
            />

            {renderFilterModal()}
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    listContainer: {
        padding: spacing.lg,
    },
    headerInfo: {
        ...colors.elevation.sm,
        marginBottom: spacing.lg,
        padding: spacing.lg,
        backgroundColor: colors.opacity.background.success,
        borderRadius: radius.lg,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.opacity.background.success,
    },
    headerTextContainer: {
        marginLeft: spacing.sm,
        flex: 1,
    },
    categoryText: {
        ...typography.styles.bodyBold,
        color: colors.success,
        marginBottom: spacing.xs,
    },
    resultCount: {
        ...typography.styles.caption,
        color: colors.text.secondary,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
        gap: spacing.sm,
    },
    searchFlex: {
        flex: 1,
    },
    filterRowBtn: {
        ...colors.elevation.sm,
        width: 52,
        height: 52,
        borderRadius: radius.input,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    filterBadge: {
        position: 'absolute',
        top: spacing.xs,
        right: spacing.xs,
        backgroundColor: colors.danger,
        borderRadius: radius.md,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterBadgeText: {
        color: colors.text.onColor,
        ...typography.styles.badge,
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
    emphasizedCard: {
        borderColor: colors.danger,
    },
    imageContainer: {
        width: 96,
        alignSelf: 'stretch',
        backgroundColor: colors.border.light,
    },
    emphasizedBadge: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.danger,
        paddingVertical: spacing.xxs,
        paddingHorizontal: spacing.xxs,
        alignItems: 'center',
    },
    emphasizedBadgeText: {
        // The badge label is set in caps, which is exactly what `overline` is tuned for.
        ...typography.styles.overline,
        color: colors.text.onColor,
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
    postPrice: {
        ...typography.styles.price,
        color: colors.primary,
    },
    postFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
        marginTop: spacing.xxs,
    },
    locationRow: {
        flexShrink: 1,
    },
    postDate: {
        ...typography.styles.small,
        color: colors.text.tertiary,
    },
    pillsWrapper: {
        borderBottomWidth: 1,
        paddingVertical: spacing.xs,
    },
    pillsContainer: {
        paddingHorizontal: spacing.lg,
        gap: spacing.sm,
        alignItems: 'center',
    },
    pill: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        minHeight: 36,
        borderRadius: radius.xxl,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillText: {
        ...typography.styles.caption,
    },
    filterSection: {
        marginBottom: spacing.xl,
    },
    filterLabel: {
        ...typography.styles.bodyBold,
        color: colors.text.primary,
        marginBottom: spacing.md,
    },
    filterOptionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    filterOption: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.xxl,
        borderWidth: 1,
        borderColor: colors.border.medium,
        backgroundColor: colors.background,
    },
    filterOptionActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    filterOptionText: {
        ...typography.styles.caption,
        color: colors.text.primary,
    },
    filterOptionTextActive: {
        ...typography.styles.labelStrong,
        color: colors.onPrimary,
    },
    locationInput: {
        borderWidth: 1,
        borderColor: colors.border.medium,
        borderRadius: radius.input,
        padding: spacing.md,
        ...typography.styles.body,
        lineHeight: undefined,
        color: colors.text.primary,
        backgroundColor: colors.background,
    },
    priceRangeRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    priceRangeInput: {
        flex: 1,
    },
    modalFooterButtons: {
        flexDirection: 'row',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    modalFooterButton: {
        flex: 1,
    },
});

export default CustomerPostList;
