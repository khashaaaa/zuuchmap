import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Switch,
    Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, radius, interactions, themedStyles, toneForTheme, animations, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import mapService from '../../services/api/mapService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';

import MapFilterModal from '../../components/MapFilterModal';
import BottomSheetModal from '../../components/BottomSheetModal';
import PressableScale from '../../components/PressableScale';
import OfflineBanner from '../../components/OfflineBanner';
import MapClusterCarousel from '../../components/MapClusterCarousel';
import EmptyState from '../../components/EmptyState';
import { getPostTypeConfig, normalizePostType } from '../../utils/postUtils';
import { useCategorySchemas } from '../../hooks/useCategorySchemas';
import { showErrorModal, showWarningModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';

const uiInitialState = {
    carouselPosts: null,
    showSettingsModal: false,
    showFilterModal: false,
};

function uiReducer(state, action) {
    switch (action.type) {
        case 'SHOW_CAROUSEL':
            return { ...state, carouselPosts: action.posts };
        case 'HIDE_CAROUSEL':
            return { ...state, carouselPosts: null };
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

// Grid cells across the visible width. Coarse enough that a dense district
// collapses to one badge, fine enough that two sites a block apart stay apart
// once zoomed in — the cell scales with the viewport, so zooming re-clusters.
const GRID_CELLS = 7;
const EMPTY = [];

/**
 * Groups posts into screen-space grid cells for the current region. Pure and
 * O(n): a `Map` keyed by cell, then one pass for centroids and the dominant
 * category (which colours the badge).
 */
const gridCluster = (posts, region) => {
    const cellLng = Math.max(region.longitudeDelta / GRID_CELLS, 1e-6);
    const cellLat = Math.max(region.latitudeDelta / GRID_CELLS, 1e-6);
    const cells = new Map();
    for (const post of posts) {
        const { latitude, longitude } = post.coordinates;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        const key = `${Math.floor(latitude / cellLat)}:${Math.floor(longitude / cellLng)}`;
        const cell = cells.get(key);
        if (cell) cell.push(post); else cells.set(key, [post]);
    }
    const out = [];
    for (const [key, group] of cells) {
        if (group.length === 1) {
            const post = group[0];
            out.push({ posts: group, coordinate: post.coordinates, count: 1, id: `single-${post.post_type}-${post.id}`, dominant: post.post_type });
            continue;
        }
        let lat = 0, lng = 0;
        const tally = new Map();
        for (const p of group) {
            lat += p.coordinates.latitude; lng += p.coordinates.longitude;
            tally.set(p.post_type, (tally.get(p.post_type) || 0) + 1);
        }
        let dominant = group[0].post_type, best = 0;
        for (const [type, n] of tally) if (n > best) { best = n; dominant = type; }
        out.push({
            posts: group,
            coordinate: { latitude: lat / group.length, longitude: lng / group.length },
            count: group.length,
            id: `cluster-${key}`,
            dominant,
        });
    }
    return out;
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
    const { carouselPosts, showSettingsModal, showFilterModal } = ui;

    const [activeFilters, setActiveFilters] = useState({});
    const [refreshing, setRefreshing] = useState(false);
    const [mapPreferences, setMapPreferences] = useState({
        mapType: 'standard',
        showTraffic: false,
        clusterMarkers: true,
        autoFitMarkers: false
    });

    // Filters arrive two ways: as route params (from a category tap on the
    // browse screen) and from the filter sheet. Only the sheet's were clearable,
    // so a route-param filter that matched nothing left the map permanently
    // blank. `routeFiltersCleared` lets "clear" drop both.
    const [routeFiltersCleared, setRouteFiltersCleared] = useState(false);
    const {
        selectedCategories: routeCategories = [],
        priceRange: routePriceRange = null,
        locationFilter: routeLocationFilter = null
    } = route?.params || {};
    const selectedCategories = routeFiltersCleared ? [] : routeCategories;
    const priceRange = routeFiltersCleared ? null : routePriceRange;
    const locationFilter = routeFiltersCleared ? null : routeLocationFilter;

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

    const { data: mapData, isFetching: loading, refetch: refetchPosts, isError: postsError } = useQuery({
        queryKey: ['map', 'posts'],
        queryFn: () => mapService.getPostsWithLocation(false),
        staleTime: 15 * 60 * 1000,
    });
    const posts = mapData?.posts ?? EMPTY;
    const fromCache = Boolean(mapData?.fromCache);

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
                id: `single-${post.post_type}-${post.id}`,
                dominant: post.post_type,
            }));
        }
        return gridCluster(filteredPosts, region);
    }, [filteredPosts, mapPreferences.clusterMarkers, region]);

    // Camera flight to a tapped pin. The target sits in the upper part of the
    // viewport so the carousel pinned at the bottom does not cover it; a
    // cluster also zooms in one step so its members start to separate.
    const flyTo = useCallback((coordinate, zoomIn = false) => {
        if (!mapRef.current || !mapReady) return;
        const latitudeDelta = zoomIn ? region.latitudeDelta / 2.5 : region.latitudeDelta;
        const longitudeDelta = zoomIn ? region.longitudeDelta / 2.5 : region.longitudeDelta;
        mapRef.current.animateToRegion({
            latitude: coordinate.latitude - latitudeDelta * 0.22,
            longitude: coordinate.longitude,
            latitudeDelta,
            longitudeDelta,
        }, animations.duration.camera);
    }, [mapReady, region]);

    const handleClusterPress = useCallback((cluster) => {
        dispatchUi({ type: 'SHOW_CAROUSEL', posts: cluster.posts });
        flyTo(cluster.coordinate, cluster.count > 1);
    }, [flyTo]);

    const handleCarouselActive = useCallback((post) => {
        if (post?.coordinates) flyTo(post.coordinates, false);
    }, [flyTo]);

    const handlePostPress = useCallback((post) => {
        // Guard: a double-tap fires before the carousel closes and pushes two frames.
        if (navigatingRef.current) return;
        navigatingRef.current = true;
        setTimeout(() => { navigatingRef.current = false; }, 800);
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

        // Badge wears the dominant category's colour so a cluster of tool
        // rentals and a cluster of job ads differ before the tap. `dominant`
        // may be a schema colour that was never tuned for a white ring, so the
        // count itself sits on a white disc — legible on any hue.
        const tint = getMarkerColor(cluster.dominant);
        return (
            <Marker
                key={id}
                coordinate={coordinate}
                onPress={() => handleClusterPress(cluster)}
                tracksViewChanges={false}
                accessibilityLabel={t('map.clusterLabel', { count })}
            >
                <View style={[styles.clusterMarkerContainer, { backgroundColor: tint, minWidth: count > 99 ? 52 : count > 9 ? 44 : 40 }]}>
                    <View style={styles.clusterDisc}>
                        <Text style={[styles.clusterText, { color: toneForTheme(tint, false) }]}>{count > 999 ? '999+' : count}</Text>
                    </View>
                </View>
            </Marker>
        );
    }, [handleClusterPress, getMarkerColor, getMarkerIcon, colors, t]);

    const activeFilterCount = useMemo(() => {
        return Object.values(activeFilters).filter(value =>
            value && (Array.isArray(value) ? value.length > 0 : true)
        ).length;
    }, [activeFilters]);

    // Route params count too — otherwise the empty state would tell a user who
    // arrived via a category tap that the catalogue is empty.
    const hasAnyFilter = activeFilterCount > 0
        || selectedCategories.length > 0
        || Boolean(priceRange)
        || Boolean(locationFilter?.enabled);

    const clearAllFilters = useCallback(() => {
        setActiveFilters({});
        setRouteFiltersCleared(true);
    }, []);

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
                            <Ionicons name="settings-outline" size={20} color={colors.iconAccent} />
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
                                ? <ActivityIndicator size="small" color={colors.iconAccent} />
                                : <Ionicons name="refresh" size={20} color={colors.iconAccent} />
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
                    onRegionChangeComplete={setRegion}
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
                    // The rail is ~290 tall; lift the buttons clear of it while open.
                    const lift = carouselPosts ? 296 : 0;
                    return (
                        <>
                            <PressableScale
                                style={[styles.floatingButton, { bottom: base + lift, right: spacing.lg }]}
                                onPress={centerOnUserLocation}
                                accessibilityRole="button"
                                accessibilityLabel={t('map.title')}
                            >
                                <Ionicons name="locate" size={20} color={MAP_OVERLAY.icon} />
                            </PressableScale>

                            <PressableScale
                                style={[styles.floatingButton, { bottom: base + lift + 60, right: spacing.lg }]}
                                onPress={fitToMarkers}
                                accessibilityRole="button"
                                accessibilityLabel={t('map.autoFit')}
                            >
                                <Ionicons name="expand" size={20} color={MAP_OVERLAY.icon} />
                            </PressableScale>

                            {carouselPosts && (
                                <MapClusterCarousel
                                    posts={carouselPosts}
                                    bottom={base}
                                    onPressPost={handlePostPress}
                                    onActiveChange={handleCarouselActive}
                                    onClose={() => dispatchUi({ type: 'HIDE_CAROUSEL' })}
                                />
                            )}
                        </>
                    );
                })()}

                <View style={styles.postCountBadge}>
                    <Text style={styles.postCountText}>
                        {filteredPosts.length} {t('map.posts')}
                    </Text>
                </View>

                {/* A map filtered down to nothing used to render as blank tiles
                    and a "0" badge — no reason given and no way back. */}
                {!loading && filteredPosts.length === 0 && (
                    <View style={styles.emptyOverlay} pointerEvents="box-none">
                        <View style={styles.emptyCard}>
                            <EmptyState
                                variant={hasAnyFilter ? 'search' : 'default'}
                                icon={hasAnyFilter ? 'funnel-outline' : 'map-outline'}
                                iconSize={40}
                                title={t(hasAnyFilter ? 'posts.noMatches' : 'posts.browseEmpty')}
                                subtitle={hasAnyFilter ? t('posts.noMatchesDesc') : undefined}
                                actionButton={hasAnyFilter
                                    ? { text: t('common.clear'), icon: 'close-circle-outline', onPress: clearAllFilters }
                                    : undefined}
                            />
                        </View>
                    </View>
                )}

                <OfflineBanner visible={fromCache} cachedAt={mapData?.cachedAt} style={styles.offlineBanner} />
            </View>

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
        // Match the tablet type scale (x1.25) or the badge digit clips.
        minWidth: isTablet ? 20 : 16,
        minHeight: isTablet ? 20 : 16,
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
        borderRadius: radius.full,
        height: 40,
        padding: 4,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: MAP_OVERLAY.surface,
    },
    clusterDisc: {
        flex: 1,
        alignSelf: 'stretch',
        borderRadius: radius.full,
        backgroundColor: MAP_OVERLAY.surface,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xs,
    },
    clusterText: { ...typography.styles.labelStrong, fontVariant: ['tabular-nums'] },
    offlineBanner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        borderBottomWidth: 0,
    },
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
    emptyOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    emptyCard: {
        ...colors.elevation.lg,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        maxWidth: 340,
        width: '100%',
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
}));

export default CustomerMapView;