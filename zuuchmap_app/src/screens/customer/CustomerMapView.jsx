import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    FlatList,
    Switch,
    Image,
    Platform,
    StyleSheet,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, radius, interactions, themedStyles, withAlpha, toneForTheme, animations } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import mapService from '../../services/api/mapService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';

import MapFilterModal from '../../components/MapFilterModal';
import BottomSheetModal from '../../components/BottomSheetModal';
import EmptyState from '../../components/EmptyState';
import PressableScale from '../../components/PressableScale';
import FadeSlideIn from '../../components/FadeSlideIn';
import { getPostTypeConfig, normalizePostType } from '../../utils/postUtils';
import { useCategorySchemas } from '../../hooks/useCategorySchemas';
import { showErrorModal, showWarningModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';

const uiInitialState = {
    selectedCluster: null,
    showClusterModal: false,
    selectedPost: null,
    showPostPreview: false,
    showSettingsModal: false,
    showFilterModal: false,
};

function uiReducer(state, action) {
    switch (action.type) {
        case 'SHOW_CLUSTER':
            return { ...state, selectedCluster: action.cluster, showClusterModal: true };
        case 'HIDE_CLUSTER':
            return { ...state, showClusterModal: false, selectedCluster: null };
        case 'SHOW_PREVIEW':
            return { ...state, selectedPost: action.post, showPostPreview: true };
        case 'HIDE_PREVIEW':
            return { ...state, showPostPreview: false, selectedPost: null };
        case 'SHOW_SETTINGS':
            return { ...state, showSettingsModal: true };
        case 'HIDE_SETTINGS':
            return { ...state, showSettingsModal: false };
        case 'SHOW_FILTER':
            return { ...state, showFilterModal: true };
        case 'HIDE_FILTER':
            return { ...state, showFilterModal: false };
        default:
            return state;
    }
}

const DEFAULT_REGION = {
    latitude: 47.9184,
    longitude: 106.9177,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
};

const CustomerMapView = ({ navigation, route }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const styles = makeStyles(colors);
    const { t } = useTranslation();

    const schemas = useCategorySchemas();

    // Marker colour and glyph come from the category schema, so a vertical added
    // in the admin UI appears on the map without an app release.
    const getMarkerColor = useCallback((postType) => (
        schemas.find((s) => s.key === normalizePostType(postType))?.color || colors.text.secondary
    ), [schemas, colors]);

    const getMarkerIcon = useCallback((postType) => (
        schemas.find((s) => s.key === normalizePostType(postType))?.icon || 'location'
    ), [schemas]);
    const mapRef = useRef(null);
    const navigatingRef = useRef(false);
    const [hasInitialized, setHasInitialized] = useState(false);

    const [region, setRegion] = useState(DEFAULT_REGION);
    const [userLocation, setUserLocation] = useState(null);
    const [mapReady, setMapReady] = useState(false);

    const [ui, dispatchUi] = useReducer(uiReducer, uiInitialState);
    const { selectedCluster, showClusterModal, selectedPost, showPostPreview, showSettingsModal, showFilterModal } = ui;

    const [activeFilters, setActiveFilters] = useState({});
    const [refreshing, setRefreshing] = useState(false);
    const [mapPreferences, setMapPreferences] = useState({
        mapType: 'standard',
        showTraffic: false,
        clusterMarkers: true,
        autoFitMarkers: false
    });

    const {
        selectedCategories = [],
        priceRange = null,
        locationFilter = null
    } = route?.params || {};

    const getUserLocation = useCallback(async (showAlert = true) => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                if (showAlert) {
                    showWarningModal(t('upload.permissionTitle'), t('provider.locationPermission'));
                }
                return null;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
                timeout: 5000,
            });

            const userCoords = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            };

            setUserLocation(userCoords);
            return userCoords;
        } catch (error) {
            logger.error('Error getting location:', error);
            if (showAlert) {
                showErrorModal(t('common.error'), t('provider.locationFail'));
            }
            return null;
        }
    }, []);

    const centerOnUserLocation = useCallback(() => {
        if (userLocation && mapRef.current && mapReady) {
            const newRegion = {
                ...userLocation,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            };
            mapRef.current.animateToRegion(newRegion, animations.duration.camera);
        } else {
            getUserLocation(true).then((coords) => {
                if (coords && mapRef.current && mapReady) {
                    const newRegion = {
                        ...coords,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                    };
                    mapRef.current.animateToRegion(newRegion, animations.duration.camera);
                }
            });
        }
    }, [userLocation, mapReady, getUserLocation]);

    const { data: posts = [], isFetching: loading, refetch: refetchPosts, isError: postsError } = useQuery({
        queryKey: ['map', 'posts'],
        queryFn: () => mapService.getPostsWithLocation(false),
        staleTime: 15 * 60 * 1000,
    });

    useEffect(() => {
        if (postsError) {
            logger.error('Error loading map posts');
            showErrorModal(t('common.error'), t('posts.loadListError'), [
                { text: t('common.retry'), onPress: () => refetchPosts() },
                { text: t('common.cancel') }
            ]);
        }
    }, [postsError]);

    // Non-location filters — does not depend on userLocation, so GPS updates don't trigger this
    const baseFilteredPosts = useMemo(() => {
        let filtered = [...posts];

        const categories = activeFilters.selectedCategories?.length
            ? activeFilters.selectedCategories
            : selectedCategories;
        if (categories.length > 0) {
            filtered = mapService.filterByCategories(filtered, categories);
        }

        const priceFilter = activeFilters.priceRange || priceRange;
        if (priceFilter?.enabled) {
            filtered = mapService.filterByPriceRange(filtered, priceFilter);
        }

        return filtered;
    }, [posts, activeFilters, selectedCategories, priceRange]);

    // Location radius filter — separate memo so GPS updates only recompute this when the filter is active
    const filteredPosts = useMemo(() => {
        const locationFilterData = activeFilters.locationFilter || locationFilter;
        if (locationFilterData?.enabled && userLocation) {
            return mapService.filterByLocationRadius(
                baseFilteredPosts,
                userLocation,
                locationFilterData.radius
            );
        }
        return baseFilteredPosts;
    }, [baseFilteredPosts, activeFilters.locationFilter, locationFilter, userLocation]);

    const clusters = useMemo(() => {
        if (!mapPreferences.clusterMarkers || filteredPosts.length === 0) {
            return filteredPosts.map(post => ({
                posts: [post],
                coordinate: post.coordinates,
                count: 1,
                id: `single-${post.post_type}-${post.id}`
            }));
        }

        const clustered = mapService.groupPostsByLocation(filteredPosts, 0.01);
        return clustered.map((cluster, index) => ({
            ...cluster,
            id: cluster.count === 1
                ? `single-${cluster.posts[0].post_type}-${cluster.posts[0].id}`
                : `cluster-${index}`
        }));
    }, [filteredPosts, mapPreferences.clusterMarkers]);

    const handleClusterPress = useCallback((cluster) => {
        if (cluster.count === 1) {
            dispatchUi({ type: 'SHOW_PREVIEW', post: cluster.posts[0] });
        } else {
            dispatchUi({ type: 'SHOW_CLUSTER', cluster });
        }
    }, []);

    const handlePostPress = useCallback((post) => {
        dispatchUi({ type: 'HIDE_CLUSTER' });
        navigation.navigate('PostDetailScreen', {
            postId: post.id,
            postType: post.post_type,
            post,
            role: 'customer',
            shouldIncrementViews: true
        });
    }, [navigation]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        refetchPosts().finally(() => setRefreshing(false));
    }, [refetchPosts]);

    const fitToMarkers = useCallback(() => {
        if (clusters.length === 0 || !mapRef.current || !mapReady) return;

        const coordinates = clusters.map(cluster => cluster.coordinate);
        if (userLocation) {
            coordinates.push(userLocation);
        }

        if (coordinates.length === 1) {
            mapRef.current.animateToRegion({
                ...coordinates[0],
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }, 1000);
            return;
        }

        const bounds = mapService.calculateBounds(coordinates);
        if (bounds) {
            const minDelta = 0.005;
            const adjustedBounds = {
                ...bounds,
                latitudeDelta: Math.max(bounds.latitudeDelta, minDelta),
                longitudeDelta: Math.max(bounds.longitudeDelta, minDelta),
            };
            mapRef.current.animateToRegion(adjustedBounds, 1000);
        }
    }, [clusters, userLocation, mapReady]);

    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...mapPreferences, [key]: value };
        setMapPreferences(newPrefs);
        await mapService.saveMapPreferences(newPrefs);
    }, [mapPreferences]);

    const handleApplyFilters = useCallback((filters) => {
        setActiveFilters(filters);
    }, []);

    useEffect(() => {
        if (!hasInitialized) {
            const initializeMap = async () => {
                try {
                    const prefs = await mapService.loadMapPreferences();
                    setMapPreferences(prefs);
                    await getUserLocation(false);
                    setHasInitialized(true);
                } catch (error) {
                    logger.error('Map initialization error:', error);
                }
            };
            initializeMap();
        }
    }, [hasInitialized, getUserLocation]);

    const renderClusterMarker = useCallback((cluster) => {
        const { coordinate, count, posts, id } = cluster;

        if (count === 1) {
            const post = posts[0];
            return (
                <Marker
                    key={id}
                    coordinate={coordinate}
                    onPress={() => handleClusterPress(cluster)}
                    tracksViewChanges={false}
                >
                    <View style={[
                        styles.singleMarkerContainer,
                        { backgroundColor: getMarkerColor(post.post_type) }
                    ]}>
                        <Ionicons
                            name={getMarkerIcon(post.post_type)}
                            size={16}
                            color={colors.text.onColor}
                        />
                    </View>
                </Marker>
            );
        }

        return (
            <Marker
                key={id}
                coordinate={coordinate}
                onPress={() => handleClusterPress(cluster)}
                tracksViewChanges={false}
            >
                <View style={styles.clusterMarkerContainer}>
                    <Text style={styles.clusterText}>{count}</Text>
                </View>
            </Marker>
        );
    }, [handleClusterPress, getMarkerColor, getMarkerIcon, colors]);

    const renderPostItem = useCallback(({ item, index }) => (
        <FadeSlideIn index={index}>
        <PressableScale
            style={[styles.clusterPostItem, { backgroundColor: colors.surface }]}
            onPress={() => handlePostPress(item)}
            accessibilityRole="button"
        >
            <View style={[
                styles.postTypeIndicator,
                { backgroundColor: getMarkerColor(item.post_type) }
            ]}>
                <Ionicons
                    name={getMarkerIcon(item.post_type)}
                    size={16}
                    color={colors.text.onColor}
                />
            </View>

            <View style={styles.postItemContent}>
                <Text style={[styles.postItemTitle, { color: colors.text.primary }]} numberOfLines={2}>
                    {mapService.getPostTitle(item)}
                </Text>
                <Text style={[styles.postItemCategory, { color: colors.text.secondary }]}>
                    {t('category.' + normalizePostType(item.post_type))}
                </Text>
                {mapService.getPostPrice(item) && (
                    <Text style={[styles.postItemPrice, { color: colors.primary }]}>
                        {mapService.getPostPrice(item)}
                    </Text>
                )}
            </View>

            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </PressableScale>
        </FadeSlideIn>
    ), [handlePostPress, colors, getMarkerColor, getMarkerIcon]);

    const activeFilterCount = useMemo(() => {
        return Object.values(activeFilters).filter(value =>
            value && (Array.isArray(value) ? value.length > 0 : true)
        ).length;
    }, [activeFilters]);

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader
                title={t('map.title')}
                showBack={false}
                rightComponent={
                    <View style={styles.mapHeaderActions}>
                        <TouchableOpacity
                            style={styles.mapHeaderBtn}
                            onPress={() => dispatchUi({ type: 'SHOW_FILTER' })}
                            hitSlop={interactions.hitSlop}
                            accessibilityRole="button"
                            accessibilityLabel={t('filter.title')}
                        >
                            <Ionicons
                                name={activeFilterCount > 0 ? 'filter' : 'filter-outline'}
                                size={20}
                                color={activeFilterCount > 0 ? colors.primary : colors.text.secondary}
                            />
                            {activeFilterCount > 0 && (
                                <View style={styles.filterBadge}>
                                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.mapHeaderBtn}
                            onPress={() => dispatchUi({ type: 'SHOW_SETTINGS' })}
                            hitSlop={interactions.hitSlop}
                            accessibilityRole="button"
                            accessibilityLabel={t('map.settings')}
                        >
                            <Ionicons name="settings-outline" size={20} color={colors.primary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.mapHeaderBtn}
                            onPress={onRefresh}
                            disabled={refreshing}
                            hitSlop={interactions.hitSlop}
                            accessibilityRole="button"
                            accessibilityLabel={t('map.refresh')}
                        >
                            {refreshing
                                ? <ActivityIndicator size="small" color={colors.primary} />
                                : <Ionicons name="refresh" size={20} color={colors.primary} />
                            }
                        </TouchableOpacity>
                    </View>
                }
            />

            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={DEFAULT_REGION}
                    onMapReady={() => setMapReady(true)}
                    provider={PROVIDER_GOOGLE}
                    showsUserLocation={true}
                    showsMyLocationButton={false}
                    showsCompass={true}
                    showsTraffic={mapPreferences.showTraffic}
                    mapType={mapPreferences.mapType}
                    toolbarEnabled={false}
                    pitchEnabled={true}
                    rotateEnabled={true}
                    scrollEnabled={true}
                    zoomEnabled={true}
                    loadingEnabled={true}
                    moveOnMarkerPress={false}
                >
                    {clusters.map(cluster => renderClusterMarker(cluster))}
                </MapView>

                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color={MAP_OVERLAY.icon} />
                        <Text style={styles.loadingText}>{t('common.loading')}</Text>
                    </View>
                )}

                {(() => {
                    const tabBarHeight = Platform.OS === 'ios' ? 88 : 65;
                    const safeBottom = insets.bottom || 0;
                    const base = tabBarHeight + safeBottom + spacing.xl;
                    return (
                        <>
                            <PressableScale
                                style={[styles.floatingButton, { bottom: base, right: spacing.lg }]}
                                onPress={centerOnUserLocation}
                                accessibilityRole="button"
                                accessibilityLabel={t('map.title')}
                            >
                                <Ionicons name="locate" size={20} color={MAP_OVERLAY.icon} />
                            </PressableScale>

                            <PressableScale
                                style={[styles.floatingButton, { bottom: base + 60, right: spacing.lg }]}
                                onPress={fitToMarkers}
                                accessibilityRole="button"
                                accessibilityLabel={t('map.autoFit')}
                            >
                                <Ionicons name="expand" size={20} color={MAP_OVERLAY.icon} />
                            </PressableScale>
                        </>
                    );
                })()}

                <View style={styles.postCountBadge}>
                    <Text style={styles.postCountText}>
                        {filteredPosts.length} {t('map.posts')}
                    </Text>
                </View>
            </View>

            <BottomSheetModal
                visible={showClusterModal}
                onClose={() => dispatchUi({ type: 'HIDE_CLUSTER' })}
                title={t('map.postsAtLocation', { count: selectedCluster?.count })}
            >
                <FlatList
                    data={selectedCluster?.posts || []}
                    renderItem={renderPostItem}
                    keyExtractor={(item) => `${item.post_type}-${item.id}`}
                    showsVerticalScrollIndicator={false}
                    style={styles.clusterPostList}
                    ListEmptyComponent={
                        <EmptyState icon="map-outline" iconSize={40} title={t('posts.empty')} />
                    }
                />
            </BottomSheetModal>

            <BottomSheetModal
                visible={showPostPreview}
                onClose={() => dispatchUi({ type: 'HIDE_PREVIEW' })}
                title={null}
            >
                {selectedPost && (() => {
                    const typeConfig = getPostTypeConfig(normalizePostType(selectedPost.post_type), colors, schemas);
                    const imageUri = selectedPost.images?.[0];
                    const price = mapService.getPostPrice(selectedPost);
                    const title = mapService.getPostTitle(selectedPost);
                    const location = [selectedPost.district, selectedPost.province].filter(Boolean).join(', ');
                    return (
                        <View style={styles.previewContainer}>
                            <View style={styles.previewImageWrap}>
                                {imageUri ? (
                                    <>
                                        <Image
                                            source={{ uri: imageUri }}
                                            style={styles.previewImage}
                                            resizeMode="cover"
                                        />
                                        <LinearGradient
                                            colors={['transparent', colors.opacity.overlay]}
                                            style={styles.previewGradient}
                                        />
                                    </>
                                ) : (
                                    <View style={[styles.previewImagePlaceholder, { backgroundColor: withAlpha(typeConfig.color, 0.13) }]}>
                                        <Ionicons name={typeConfig.iconName} size={40} color={toneForTheme(typeConfig.color, isDark)} />
                                    </View>
                                )}
                                <View style={[styles.previewCategoryPill, { backgroundColor: typeConfig.color }]}>
                                    <Ionicons name={typeConfig.iconName} size={12} color={colors.text.onColor} />
                                    <Text style={styles.previewCategoryText}>{t('category.' + normalizePostType(selectedPost.post_type))}</Text>
                                </View>
                            </View>

                            <View style={styles.previewBody}>
                                <Text style={styles.previewTitle} numberOfLines={2}>{title}</Text>
                                {price && <Text style={styles.previewPrice}>{price}</Text>}
                                {location ? (
                                    <View style={styles.previewLocation}>
                                        <Ionicons name="location-outline" size={13} color={colors.text.secondary} />
                                        <Text style={styles.previewLocationText}>{location}</Text>
                                    </View>
                                ) : null}
                                <TouchableOpacity
                                    style={[styles.previewDetailButton, { backgroundColor: typeConfig.color }]}
                                    onPress={() => {
                                        // Guard: a double-tap fires before the sheet closes and pushes two frames.
                                        if (navigatingRef.current) return;
                                        navigatingRef.current = true;
                                        setTimeout(() => { navigatingRef.current = false; }, 800);
                                        dispatchUi({ type: 'HIDE_PREVIEW' });
                                        navigation.navigate('PostDetailScreen', {
                                            postId: selectedPost.id,
                                            postType: selectedPost.post_type,
                                            post: selectedPost,
                                            role: 'customer',
                                            shouldIncrementViews: true,
                                        });
                                    }}
                                    activeOpacity={interactions.activeOpacity}
                                >
                                    <Text style={styles.previewDetailButtonText}>{t('common.details')}</Text>
                                    <Ionicons name="arrow-forward" size={16} color={colors.text.onColor} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })()}
            </BottomSheetModal>

            <BottomSheetModal
                visible={showSettingsModal}
                onClose={() => dispatchUi({ type: 'HIDE_SETTINGS' })}
                title={t('map.settings')}
            >
                <View style={[styles.settingItem, { borderBottomColor: colors.border.light }]}>
                    <Text style={[styles.settingLabel, { color: colors.text.primary }]}>{t('map.clusterMarkers')}</Text>
                    <Switch
                        value={mapPreferences.clusterMarkers}
                        onValueChange={(value) => updatePreference('clusterMarkers', value)}
                        trackColor={{ false: colors.border.medium, true: colors.primary }}
                        thumbColor={colors.surface}
                    />
                </View>

                <View style={[styles.settingItem, { borderBottomColor: colors.border.light }]}>
                    <Text style={[styles.settingLabel, { color: colors.text.primary }]}>{t('map.autoFit')}</Text>
                    <Switch
                        value={mapPreferences.autoFitMarkers}
                        onValueChange={(value) => updatePreference('autoFitMarkers', value)}
                        trackColor={{ false: colors.border.medium, true: colors.primary }}
                        thumbColor={colors.surface}
                    />
                </View>

                <View style={[styles.settingItem, { borderBottomColor: colors.border.light }]}>
                    <Text style={[styles.settingLabel, { color: colors.text.primary }]}>{t('map.showTraffic')}</Text>
                    <Switch
                        value={mapPreferences.showTraffic}
                        onValueChange={(value) => updatePreference('showTraffic', value)}
                        trackColor={{ false: colors.border.medium, true: colors.primary }}
                        thumbColor={colors.surface}
                    />
                </View>
            </BottomSheetModal>

            <MapFilterModal
                visible={showFilterModal}
                onClose={() => dispatchUi({ type: 'HIDE_FILTER' })}
                onApplyFilters={handleApplyFilters}
                initialFilters={activeFilters}
                userLocation={userLocation}
                posts={posts}
            />
        </CustomSafeAreaView>
    );
};

// Map furniture sits on Google's tiles, which do not change with the app
// theme — so these colours are fixed in both modes (same idiom as the map
// pins' white ring / the web `.map-pin`). Amber is the dark-palette primary
// (the brightest accent); icons on white use the light chart amber, the
// darkest amber that still clears 3:1 on white.
const MAP_OVERLAY = {
    accent: '#F5A623',
    onAccent: '#1A1200',
    surface: '#FFFFFF',
    icon: '#C87206',
    text: '#1A1C1E',
    scrim: 'rgba(255, 255, 255, 0.75)',
    shadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
};

const makeStyles = themedStyles((colors) => ({
    mapHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    mapHeaderBtn: {
        padding: spacing.sm,
        borderRadius: radius.md,
        position: 'relative',
    },
    filterBadge: {
        position: 'absolute',
        top: spacing.xxs,
        right: spacing.xxs,
        backgroundColor: colors.danger,
        borderRadius: radius.md,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xxs,
    },
    filterBadgeText: {
        color: colors.text.onColor,
        ...typography.styles.badge,
    },
    mapContainer: {
        flex: 1,
        position: 'relative',
    },
    map: {
        flex: 1,
    },
    singleMarkerContainer: {
        ...MAP_OVERLAY.shadow,
        width: 32,
        height: 32,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: MAP_OVERLAY.surface,
    },
    clusterMarkerContainer: {
        ...MAP_OVERLAY.shadow,
        backgroundColor: MAP_OVERLAY.accent,
        borderRadius: radius.xxl,
        minWidth: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: MAP_OVERLAY.surface,
    },
    clusterText: { ...typography.styles.labelStrong, color: MAP_OVERLAY.onAccent, },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: MAP_OVERLAY.scrim,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: spacing.sm,
        ...typography.styles.caption,
        color: MAP_OVERLAY.text,
    },
    floatingButton: {
        ...MAP_OVERLAY.shadow,
        position: 'absolute',
        width: 48,
        height: 48,
        borderRadius: radius.full,
        backgroundColor: MAP_OVERLAY.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    postCountBadge: {
        ...MAP_OVERLAY.shadow,
        position: 'absolute',
        top: spacing.lg,
        left: spacing.lg,
        backgroundColor: MAP_OVERLAY.accent,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.xxl,
    },
    postCountText: {
        color: MAP_OVERLAY.onAccent,
        ...typography.styles.labelStrong,
    },
    clusterPostList: {
        flex: 1,
    },
    clusterPostItem: {
        ...colors.elevation.sm,
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        backgroundColor: colors.background,
        borderRadius: radius.lg,
        marginBottom: spacing.sm,
    },
    postTypeIndicator: {
        width: 40,
        height: 40,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    postItemContent: {
        flex: 1,
    },
    postItemTitle: {
        ...typography.styles.bodyBold,
        color: colors.text.primary,
        marginBottom: spacing.xxs,
    },
    postItemCategory: {
        ...typography.styles.small,
        color: colors.text.secondary,
        marginBottom: spacing.xxs,
    },
    postItemPrice: {
        ...typography.styles.price,
        color: colors.primary,
    },
    settingItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
    },
    settingLabel: {
        ...typography.styles.body,
        color: colors.text.primary,
        flex: 1,
    },
    previewContainer: {
        paddingBottom: spacing.md,
    },
    previewImageWrap: {
        width: '100%',
        height: 180,
        borderRadius: radius.card,
        overflow: 'hidden',
        marginBottom: spacing.md,
        position: 'relative',
        backgroundColor: colors.border.light,
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    previewGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 80,
    },
    previewImagePlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewCategoryPill: {
        position: 'absolute',
        top: spacing.sm,
        left: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.xxl,
    },
    previewCategoryText: {
        color: colors.text.onColor,
        ...typography.styles.badge,
    },
    previewBody: {
        paddingHorizontal: spacing.xs,
    },
    previewTitle: {
        ...typography.styles.title,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    previewPrice: {
        ...typography.styles.price,
        color: colors.primary,
        marginBottom: spacing.sm,
    },
    previewLocation: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.lg,
    },
    previewLocationText: {
        ...typography.styles.caption,
        color: colors.text.secondary,
    },
    previewDetailButton: {
        ...colors.elevation.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        borderRadius: radius.button,
    },
    previewDetailButtonText: {
        color: colors.text.onColor,
        ...typography.styles.bodyBold,
    },
}));

export default CustomerMapView;