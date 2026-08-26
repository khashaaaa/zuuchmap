import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
    ActivityIndicator,
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
import { CategoryBadge, StatusBadge, SkeletonItem, EmptyState, LocationRow, FadeSlideIn, Button, SelectionPop, AvailabilityStrip, OfflineBanner, SavedSearchSheet } from '../../components';
import ScreenError from '../../components/ScreenError';
import SearchInput from '../../components/SearchInput';
import BottomSheetModal from '../../components/BottomSheetModal';
import PressableScale from '../../components/PressableScale';
import { getFixedImageUrl, getPostPrice, getPostImage, getPostTitle as getPostTitleUtil, categoryToPostType, getSchemaLabel } from '../../utils/postUtils';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { provinces as PROVINCE_CODES, districts as DISTRICT_CODES } from '../../config/app.config';
import { useDebounce } from '../../hooks/useDebounce';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import { getErrorMessage } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import likeService from '../../services/api/likeService';
import userService from '../../services/api/userService';
import NotificationBell from '../../components/NotificationBell';

// Browse pages through the API. The engine caps `limit` at 100 (post.service.ts),
// so the list must page — a single fetch silently truncated the marketplace.
const PAGE_SIZE = 20;

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
    featured = false,
    featuredLabel = '',
    rentalStrip = false,
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
                        <Ionicons name="image-outline" size={28} color={colors.iconAccent} />
                    </View>
                )}
                {/* The thumbnail is 96pt wide and holds exactly one overlay.
                    Status stays here — it belongs on the photo — while emphasis
                    and featured moved into the content column below. All three
                    were absolutely positioned in here with `maxWidth: '92%'`
                    apiece, so ~88pt of badge sat in a 96pt box from both
                    corners at once and they printed straight through each
                    other, the status pill (zIndex 2) winning. */}
                {item.status && (
                    <StatusBadge
                        status={item.status}
                        variant="overlay"
                        position="absolute"
                        showIndicator={false}
                    />
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

                {/* One wrapping row, at the content column's width, so the
                    labels stay readable instead of truncating to a few glyphs.
                    The emphasis badge REPLACES the category badge rather than
                    joining it: `emphasisLabel` is that category's own label, so
                    rendering both would print the same words twice — it is the
                    category chip set loud. The card also carries the tinted
                    `emphasizedCard` ground, so the signal survives either way. */}
                <View style={styles.badgeRow}>
                    {emphasized && !!emphasisLabel ? (
                        <View style={styles.emphasizedBadge}>
                            <Text style={styles.emphasizedBadgeText} numberOfLines={1}>{emphasisLabel}</Text>
                        </View>
                    ) : (
                        <CategoryBadge
                            postType={item.post_type || 'construction'}
                            showIcon={true}
                        />
                    )}
                    {featured && (
                        <View style={styles.featuredBadge}>
                            <Ionicons name="star" size={10} color={colors.onPrimary} />
                            <Text style={styles.featuredBadgeText} numberOfLines={1}>{featuredLabel}</Text>
                        </View>
                    )}
                </View>

                {price && (
                    <Text style={styles.postPrice}>{price}</Text>
                )}

                {rentalStrip && (
                    <AvailabilityStrip busyDates={item.busy_dates} size="sm" />
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
        prevProps.item.busy_dates === nextProps.item.busy_dates &&
        prevProps.rentalStrip === nextProps.rentalStrip &&
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
        province: routeProvince,
        district: routeDistrict,
        q: routeQuery,
    } = route?.params || {};

    // isFilterMode: navigated to with a category (from SubcategorySelectScreen)
    // isBrowseMode: used as a tab, show all posts with filter modal
    const isFilterMode = Boolean(routeCategory);

    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState(routeQuery || '');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [likedPostsStatus, setLikedPostsStatus] = useState({});
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isCustomer, setIsCustomer] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showSaveSearch, setShowSaveSearch] = useState(false);
    const [filters, setFilters] = useState({
        category: routeCategory || '',
        subcategory: routeSubcategory || '',
        priceMin: '',
        priceMax: '',
        sort: '',
        province: routeProvince || '',
        district: routeDistrict || '',
        status: isFilterMode ? '' : 'active',
    });
    // Price inputs are debounced: every keystroke would otherwise start a new
    // server query and reset paging.
    const debouncedPriceMin = useDebounce(filters.priceMin, 400);
    const debouncedPriceMax = useDebounce(filters.priceMax, 400);

    const bottomPadding = useMemo(() => {
        const tabBarHeight = Platform.OS === 'ios' ? 88 : 65;
        const safeAreaBottom = safeAreaHelpers.getBottomSafeArea(insets);
        return Math.max(tabBarHeight + safeAreaBottom, spacing.xl + 80);
    }, [insets]);

    // --- Data fetching ---

    // Filter mode: fetch by specific post type
    const getPostType = useMemo(() => (isFilterMode ? categoryToPostType(routeCategory) : null), [isFilterMode, routeCategory]);

    // Every narrowing is a server parameter. Filtering client-side only ever saw
    // the first page, so "cheapest" and "most viewed" ranked one page, not the
    // marketplace. The engine owns category/subcategory/province/district/price/
    // sort/full-text (post.service.ts) — mirror the web browse exactly.
    const queryFilters = useMemo(() => {
        const q = debouncedSearchQuery.trim();
        const params = {
            approval_status: 'APPROVED',
            limit: PAGE_SIZE,
            category: isFilterMode ? getPostType : (filters.category || undefined),
            subcategory: isFilterMode ? (routeSubcategory || undefined) : undefined,
            q: q || undefined,
        };
        if (!isFilterMode) {
            if (filters.province) params.province = filters.province;
            if (filters.district) params.district = filters.district;
            if (filters.sort) params.sort = filters.sort;
            if (debouncedPriceMin) params.price_min = debouncedPriceMin;
            if (debouncedPriceMax) params.price_max = debouncedPriceMax;
            // Enum values are uppercase server-side; the chips carry lowercase.
            if (filters.status) params.status = filters.status.toUpperCase();
        }
        return params;
    }, [
        isFilterMode, getPostType, routeSubcategory, debouncedSearchQuery,
        filters.category, filters.province, filters.district, filters.sort, filters.status,
        debouncedPriceMin, debouncedPriceMax,
    ]);

    const {
        data,
        isLoading: loadingRaw,
        isError,
        error: errorObj,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['posts', 'browse', queryFilters],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const response = await postService.getList({ ...queryFilters, page: pageParam });
            const items = (Array.isArray(response?.data) ? response.data : []).map((post) => ({
                ...post,
                post_type: post.category,
                imageUrl: getPostImageUrl(post.images?.[0]),
            }));
            return {
                items,
                total: response.total ?? items.length,
                page: pageParam,
                fromCache: Boolean(response?.fromCache),
                cachedAt: response?.cachedAt ?? null,
            };
        },
        getNextPageParam: (last) =>
            last.page * PAGE_SIZE < last.total ? last.page + 1 : undefined,
        staleTime: 30_000,
    });

    const posts = useMemo(() => (data?.pages ?? []).flatMap((pg) => pg.items), [data]);
    const totalCount = data?.pages?.[0]?.total ?? 0;
    const firstPage = data?.pages?.[0];
    const loading = useMinDisplayTime(loadingRaw);

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
        if (isError) logger.warn('Could not load posts');
    }, [isError]);

    useEffect(() => {
        userService.isAuthenticated().then(authStatus => {
            const authenticated = authStatus?.authenticated ?? false;
            setIsAuthenticated(authenticated);
            setIsCustomer(authenticated && !authStatus?.is_admin && authStatus?.userType === 'CUSTOMER');
        }).catch(() => {});
    }, []);

    // Keyed on the user, not the page: the liked-id set is the same whatever is
    // scrolled into view, so this is one cached request instead of one per
    // category per appended page.
    const { data: likedByType } = useQuery({
        queryKey: ['liked', 'ids'],
        queryFn: () => likeService.likedIdsByType(),
        enabled: isAuthenticated,
        staleTime: 60_000,
    });

    useEffect(() => {
        setLikedPostsStatus(likeService.likedStatusMap(likedByType));
    }, [likedByType]);

    // --- Callbacks ---

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    // Paging is what keeps the list honest: without it the screen showed one
    // page and read as the whole marketplace.
    const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
            province: '',
            district: '',
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

    // Categories that take bookings get the 14-day availability strip on the card.
    const rentalByKey = useMemo(() => {
        const map = {};
        for (const c of categorySchemas) if (c.has_rental_status) map[c.key] = true;
        return map;
    }, [categorySchemas]);

    const renderPostItem = useCallback(({ item, index }) => {
        const post_key = `${item.post_type || 'construction'}-${item.id}`;
        return (
            <FadeSlideIn index={index} style={isTablet && { flex: 1 }}>
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
                    featured={!!item.featured_until && new Date(item.featured_until) > new Date()}
                    featuredLabel={t('posts.featured')}
                    emphasisLabel={emphasisByKey[item.post_type] || ''}
                    rentalStrip={!!rentalByKey[item.post_type]}
                />
            </FadeSlideIn>
        );
    }, [handlePostPress, getPostTitleMemo, getPostPriceMemo, getPostImageMemo, likedPostsStatus, isAuthenticated, handleLikeChange, colors, emphasisByKey, rentalByKey]);

    const keyExtractor = useCallback((item) => item.id.toString(), []);

    const renderFooter = useCallback(() => {
        if (isFetchingNextPage) {
            return (
                <View style={styles.listFooter}>
                    <ActivityIndicator size="small" color={colors.iconAccent} />
                </View>
            );
        }
        // "You have reached the end" only when it is actually the end — the old
        // list stopped at one page with no way to tell truncation from exhaustion.
        if (!hasNextPage && posts.length > 0 && totalCount > PAGE_SIZE) {
            return (
                <View style={styles.listFooter}>
                    <Text style={[styles.listFooterText, { color: colors.text.secondary }]}>
                        {t('filter.resultsFound', { count: totalCount })}
                    </Text>
                </View>
            );
        }
        return null;
    }, [isFetchingNextPage, hasNextPage, posts.length, totalCount, colors, styles, t]);

    const renderHeader = useCallback(() => {
        if (!isFilterMode) {
            if (totalCount === 0) return null;
            return (
                <Text style={[styles.browseCount, { color: colors.text.secondary }]}>
                    {t('filter.resultsFound', { count: totalCount })}
                </Text>
            );
        }
        return (
            <View style={styles.headerInfo}>
                <Ionicons name="checkmark-circle" size={20} color={colors.iconAccent} />
                <View style={styles.headerTextContainer}>
                    <Text style={styles.categoryText}>
                        {categoryDisplayName} → {subcategoryDisplayName}
                    </Text>
                    <Text style={styles.resultCount}>
                        {t('filter.resultsFound', { count: totalCount })}
                        {searchQuery && ` "${searchQuery}"`}
                    </Text>
                </View>
            </View>
        );
    }, [isFilterMode, categoryDisplayName, subcategoryDisplayName, totalCount, searchQuery, colors, styles, t]);

    const renderEmptyState = useCallback(() => {
        if (isError) {
            // Broken must not look like empty — siblings use ScreenError for fetch failures.
            return (
                <ScreenError
                    icon="cloud-offline-outline"
                    message={getErrorMessage(errorObj)}
                    onRetry={refetch}
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
    }, [isError, errorObj, refetch, searchQuery, activeFiltersCount, clearFilters, t]);

    const renderSaveSearchButton = () => {
        if (!isAuthenticated || activeFiltersCount === 0) return null;
        return (
            <TouchableOpacity
                onPress={() => setShowSaveSearch(true)}
                style={[styles.filterRowBtn, { backgroundColor: colors.surface, borderColor: colors.border.light }]}
                activeOpacity={interactions.activeOpacity}
                accessibilityRole="button"
                accessibilityLabel={t('savedSearch.save')}
            >
                <Ionicons name="bookmark-outline" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
        );
    };

    const renderSaveSearchSheet = () => (
        <SavedSearchSheet
            visible={showSaveSearch}
            onClose={() => setShowSaveSearch(false)}
            filters={{
                category: filters.category,
                subcategory: filters.subcategory,
                province: filters.province,
                district: filters.district,
                q: debouncedSearchQuery,
            }}
        />
    );

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
                            title={t('common.done')}
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

                {/* Province/district are enum codes server-side; the old free-text
                    box compared what the user typed ("Баянзүрх") against the raw
                    code ("BAYANZURKH") and matched nothing. */}
                <View style={styles.filterSection}>
                    <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('common.province')}</Text>
                    <View style={styles.filterOptionsContainer}>
                        {[''].concat(PROVINCE_CODES).map((code) => {
                            const isActive = filters.province === code;
                            return (
                                <SelectionPop key={code || 'all'} selected={isActive}>
                                    <TouchableOpacity
                                        style={[styles.filterOption, isActive && styles.filterOptionActive]}
                                        onPress={() => setFilters(prev => ({
                                            ...prev,
                                            province: code,
                                            // District only exists inside Ulaanbaatar — never leave a
                                            // stale district narrowing a different province to zero.
                                            district: code === 'ULAANBAATAR' ? prev.district : '',
                                        }))}
                                        activeOpacity={interactions.activeOpacity}
                                    >
                                        <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]}>
                                            {code ? t(`province.${code}`, { defaultValue: code }) : t('filter.all')}
                                        </Text>
                                    </TouchableOpacity>
                                </SelectionPop>
                            );
                        })}
                    </View>
                </View>

                {filters.province === 'ULAANBAATAR' && (
                    <View style={styles.filterSection}>
                        <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('common.district')}</Text>
                        <View style={styles.filterOptionsContainer}>
                            {[''].concat(DISTRICT_CODES).map((code) => {
                                const isActive = filters.district === code;
                                return (
                                    <SelectionPop key={code || 'all'} selected={isActive}>
                                        <TouchableOpacity
                                            style={[styles.filterOption, isActive && styles.filterOptionActive]}
                                            onPress={() => setFilters(prev => ({ ...prev, district: code }))}
                                            activeOpacity={interactions.activeOpacity}
                                        >
                                            <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]}>
                                                {code ? t(`district.${code}`, { defaultValue: code }) : t('filter.all')}
                                            </Text>
                                        </TouchableOpacity>
                                    </SelectionPop>
                                );
                            })}
                        </View>
                    </View>
                )}
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
                    keyboardShouldPersistTaps="handled"
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
                    {!isFilterMode && renderSaveSearchButton()}
                </View>
                {renderCategoryPills()}
                <FlatList
                    data={Array(12).fill({})}
                    keyboardShouldPersistTaps="handled"
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
                                {!isFilterMode && renderSaveSearchButton()}
            </View>
                        )}
                    </TouchableOpacity>
                )}
                {!isFilterMode && renderSaveSearchButton()}
            </View>

            {renderCategoryPills()}

            {renderSaveSearchSheet()}
            <OfflineBanner visible={Boolean(firstPage?.fromCache)} cachedAt={firstPage?.cachedAt} />

            <FlatList
                data={posts}
                keyboardShouldPersistTaps="handled"
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
                ListFooterComponent={renderFooter}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.4}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[colors.iconAccent]}
                        tintColor={colors.iconAccent}
                        progressBackgroundColor={colors.surface}
                        titleColor={colors.text.secondary}
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
    listFooter: {
        paddingVertical: spacing.lg,
        alignItems: 'center',
    },
    listFooterText: {
        ...typography.styles.caption,
    },
    browseCount: {
        ...typography.styles.caption,
        marginBottom: spacing.md,
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
        // Match the tablet type scale (x1.25) or the badge digit clips.
        minWidth: isTablet ? 20 : 16,
        minHeight: isTablet ? 20 : 16,
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
        ...colors.elevation.selected,
        backgroundColor: colors.opacity.background.primaryLight,
    },
    imageContainer: {
        width: 96,
        alignSelf: 'stretch',
        backgroundColor: colors.border.light,
    },
    // Category, emphasis and paid placement share one wrapping row in the
    // content column. They flow rather than stack in corners, so two of them
    // pushes the third onto a second line instead of over the top of it.
    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        // flex-start, not center: CategoryBadge sets its own `alignSelf:
        // 'flex-start'`, so centering the row would leave it alone out of line.
        alignItems: 'flex-start',
        gap: spacing.xs,
    },
    emphasizedBadge: {
        flexShrink: 1,
        backgroundColor: colors.primary,
        paddingVertical: spacing.xxs,
        paddingHorizontal: spacing.xs,
        borderRadius: radius.sm,
    },
    // Paid placement.
    featuredBadge: {
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        backgroundColor: colors.primary,
        paddingVertical: spacing.xxs,
        paddingHorizontal: spacing.xs,
        borderRadius: radius.sm,
    },
    featuredBadgeText: {
        ...typography.styles.overline,
        color: colors.onPrimary,
        // Yoga defaults flexShrink to 0: without this a long translation pushes
        // the star out of the badge instead of truncating.
        flexShrink: 1,
    },
    emphasizedBadgeText: {
        // The badge label is set in caps, which is exactly what `overline` is tuned for.
        ...typography.styles.overline,
        color: colors.onPrimary,
        flexShrink: 1,
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
        color: colors.text.link,
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
