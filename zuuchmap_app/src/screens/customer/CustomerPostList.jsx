import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    ScrollView,
    RefreshControl,
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
import LikeButton from '../../components/LikeButton';
import PostCard from '../../components/PostCard';
import { ScreenLayout, CategoryBadge, SkeletonItem, EmptyState, LocationRow, SelectionPop, AvailabilityStrip, OfflineBanner, SavedSearchSheet, BrowseFilterSheet } from '../../components';
import ScreenError from '../../components/ScreenError';
import SearchInput from '../../components/SearchInput';
import { getFixedImageUrl, getPostPrice, getPostImage, getPostTitle as getPostTitleUtil, categoryToPostType, getSchemaLabel } from '../../utils/postUtils';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useToggleLike, toggleLikedIdInCache, LIKED_IDS_KEY } from '../../hooks/useToggleLike';
import { useDebounce } from '../../hooks/useDebounce';
import { getErrorMessage } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import likeService from '../../services/api/likeService';
import userService from '../../services/api/userService';
import NotificationBell from '../../components/NotificationBell';

// Browse pages through the API. The engine caps `limit` at 100 (post.service.ts),
// so the list must page — a single fetch silently truncated the marketplace.
const PAGE_SIZE = 20;

const CustomerPostList = ({ route, navigation }) => {
    const { colors, styles: gStyles, isDark } = useAppTheme();
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
    const loading = loadingRaw;

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
        queryKey: LIKED_IDS_KEY,
        queryFn: () => likeService.likedIdsByType(),
        enabled: isAuthenticated,
        staleTime: 60_000,
    });
    const likedPostsStatus = useMemo(() => likeService.likedStatusMap(likedByType), [likedByType]);

    // Optimistic: flip the id in the cache the list reads from; put it back on failure.
    const qc = useQueryClient();
    const toggleLike = useToggleLike({
        onMutate: (vars) => toggleLikedIdInCache(qc, vars),
        onRollback: (_vars, previous) => qc.setQueryData(LIKED_IDS_KEY, previous),
    });

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

    const handleToggleLike = useCallback((item, liked) => {
        toggleLike.mutate({ post_type: item.post_type || 'construction', post_id: item.id, liked });
    }, [toggleLike.mutate]);

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
        const liked = likedPostsStatus[post_key] || false;
        const emphasisLabel = emphasisByKey[item.post_type] || '';
        const featured = !!item.featured_until && new Date(item.featured_until) > new Date();
        const imageUri = getPostImage(item);
        // Only the heart whose request is in flight is held; the rest stay tappable.
        const pending = toggleLike.isPending && toggleLike.variables?.post_id === item.id;
        return (
            <View style={isTablet && { flex: 1 }}>
                <PostCard
                    item={item}
                    onPress={handlePostPress}
                    imageUri={imageUri ? getFixedImageUrl(imageUri) : null}
                    title={getPostTitleUtil(item, item.post_type)}
                    price={getPostPrice(item)}
                    emphasized={!!emphasisLabel}
                    statusOverlay
                    memoKey={`${liked}-${pending}-${isCustomer}-${item.status}-${item.busy_dates}-${emphasisLabel}-${i18n.language}-${isDark}`}
                    actions={isCustomer ? (
                        <LikeButton liked={liked} size="small" disabled={pending} onToggle={() => handleToggleLike(item, liked)} />
                    ) : null}
                    badges={
                        <View style={styles.badgeRow}>
                            {emphasisLabel ? (
                                <View style={styles.emphasizedBadge}>
                                    <Text style={styles.badgeText} numberOfLines={1}>{emphasisLabel}</Text>
                                </View>
                            ) : (
                                <CategoryBadge postType={item.post_type || 'construction'} showIcon={true} />
                            )}
                            {featured && (
                                <View style={styles.featuredBadge}>
                                    <Ionicons name="star" size={10} color={colors.onPrimary} />
                                    <Text style={styles.badgeText} numberOfLines={1}>{t('posts.featured')}</Text>
                                </View>
                            )}
                        </View>
                    }
                    footer={(
                        <>
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
                        </>
                    )}
                >
                    {!!rentalByKey[item.post_type] && <AvailabilityStrip busyDates={item.busy_dates} size="sm" />}
                </PostCard>
            </View>
        );
    }, [handlePostPress, likedPostsStatus, isCustomer, handleToggleLike, toggleLike.isPending, toggleLike.variables, colors, styles, emphasisByKey, rentalByKey, t, i18n.language]);

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
                accent={activeFiltersCount > 0 ? categorySchemas.find((c) => c.key === filters.category)?.color : undefined}
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
            <BrowseFilterSheet
                visible={showFilters}
                onClose={() => setShowFilters(false)}
                onClear={clearFilters}
                filters={filters}
                setFilters={setFilters}
                categoryOptions={categoryOptions}
            />
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

    // --- Header + search row (shared by the skeleton and the list) ---

    const headerRight = <NotificationBell />;

    const renderSearchRow = () => (
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
    );

    const shellProps = {
        title: t('posts.browseTitle'),
        showBack: isFilterMode,
        onBack: isFilterMode ? () => navigation.goBack() : undefined,
        rightComponent: headerRight,
    };

    // --- Loading skeleton ---

    if (loading && posts.length === 0) {
        return (
            <ScreenLayout {...shellProps}>
                {renderSearchRow()}
                {renderCategoryPills()}
                <FlatList
                    data={Array(6).fill({})}
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
            </ScreenLayout>
        );
    }

    // --- Main render ---

    return (
        <ScreenLayout {...shellProps}>
            {renderSearchRow()}

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
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
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
    // The emphasis badge REPLACES the category badge: `emphasisLabel` is that
    // category's own label, so rendering both would print the same words twice.
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
    // Set in caps, which is exactly what `overline` is tuned for. Yoga defaults
    // flexShrink to 0: without it a long translation pushes the star out of
    // the badge instead of truncating.
    badgeText: {
        ...typography.styles.overline,
        color: colors.onPrimary,
        flexShrink: 1,
    },
    locationRow: {
        flexShrink: 1,
    },
    postDate: {
        ...typography.styles.small,
        color: colors.text.tertiary,
    },
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
});

export default CustomerPostList;
