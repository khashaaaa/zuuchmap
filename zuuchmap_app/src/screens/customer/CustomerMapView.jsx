import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Switch,
    Platform,
    PixelRatio,
    StyleSheet,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, radius, interactions, toneForTheme, animations, isTablet, mapStyleFor, withAlpha } from '../../design/theme';
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
import { normalizePostType } from '../../utils/postUtils';
import { useCategorySchemas } from '../../hooks/useCategorySchemas';
import { showErrorModal, showWarningModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { useListBottomPadding } from '../../hooks/useListBottomPadding';

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

// Google's own POI layer draws hospital, restaurant and transit pins in the
// same visual language as ours, and there are far more of them — on a first
// open the only pins on screen were Google's. `showsPointsOfInterest` covers
// iOS; Android needs the style array.
const FIRST_FIX_RADIUS_KM = 25;

// Room around a fitted frame for what is drawn over it: the post-count badge
// top-left, the round buttons bottom-right, and half a cluster badge on every
// side. A bounds box padded by 10% put edge badges half off the screen.
// In dp on both platforms in this react-native-maps (1.20): scaling it by the
// pixel ratio, as older versions needed on Android, zoomed out to half a continent.
const FIT_PADDING = { top: 96, right: 72, bottom: 120, left: 48 };

// react-native-maps 1.20.1 (the version Expo SDK 54 pins) never learns a custom
// marker's size under the new architecture on Android: `MapMarker.createDrawable`
// falls back to a fixed 100x100 *pixel* bitmap and draws the child into it from
// the top-left. Anything larger is cut off on the right and bottom — at this
// density a 46dp cluster pill lost a third of itself, and no amount of styling
// the child changes the bitmap. So a marker has to fit in 100px, which is a
// different number of dp on every screen.
const MARKER_MAX_DP = Platform.OS === 'android' ? Math.floor(100 / PixelRatio.get()) : 64;
const PIN_SIZE = Math.min(32, MARKER_MAX_DP);
const CLUSTER_SIZE = Math.min(40, MARKER_MAX_DP);

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
 * One map pin, memoised so a screen re-render (the carousel opening, a filter
 * sheet) does not rebuild every marker. `tracks` is the screen's shared
 * `tracksViewChanges` beat — see `tracksMarkers`.
 */
const MapPin = React.memo(({ cluster, onPress, tint, icon, label, textColor, iconColor, styles, accessibilityLabel, tracks }) => {
    const handlePress = useCallback(() => onPress(cluster), [onPress, cluster]);
    return (
        <Marker
            coordinate={cluster.coordinate}
            onPress={handlePress}
            tracksViewChanges={tracks}
            accessibilityLabel={accessibilityLabel}
        >
            {label == null ? (
                <View style={[styles.singleMarkerContainer, { backgroundColor: tint }]}>
                    <Ionicons name={icon} size={16} color={iconColor} />
                </View>
            ) : (
                // A fixed circle, never a pill that widens with the count — see
                // MARKER_MAX_DP. The type steps down instead.
                <View style={[styles.clusterMarkerContainer, { backgroundColor: tint }]}>
                    <View style={styles.clusterDisc}>
                        <Text
                            style={[styles.clusterText, label.length > 2 && styles.clusterTextLong, { color: textColor }]}
                            numberOfLines={1}
                            allowFontScaling={false}
                        >
                            {label}
                        </Text>
                    </View>
                </View>
            )}
        </Marker>
    );
});

/** A zoom change smaller than this (as a log ratio, ~10%) keeps the clusters. */
const RECLUSTER_ZOOM_STEP = 0.1;

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
    // Neighbouring cells can hold pins a few metres apart across a cell edge,
    // and their two badges were drawn on top of each other. Merge any group
    // whose centroid falls within ¾ of a cell of a larger one; largest first,
    // ties by key, so both clients merge the same way (web `mapCluster.js`).
    const centroidOf = (group) => {
        let la = 0, ln = 0;
        for (const p of group) { la += p.coordinates.latitude; ln += p.coordinates.longitude; }
        return { lat: la / group.length, lng: ln / group.length };
    };
    const ordered = [...cells]
        .map(([key, group]) => ({ key, group, ...centroidOf(group) }))
        .sort((a, b) => b.group.length - a.group.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const merged = [];
    for (const g of ordered) {
        const host = merged.find(
            (m) => Math.abs(m.lat - g.lat) < cellLat * 0.75 && Math.abs(m.lng - g.lng) < cellLng * 0.75,
        );
        if (host) {
            host.group.push(...g.group);
            Object.assign(host, centroidOf(host.group));
        } else merged.push(g);
    }
    const out = [];
    for (const { key, group } of merged) {
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
    const listBottom = useListBottomPadding();
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
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
    // The camera follows the user's position exactly once (first fix); after
    // that only explicit actions (locate button, marker/cluster select) move it.
    const firstFixDoneRef = useRef(false);
    const navigatingRef = useRef(false);
    const [hasInitialized, setHasInitialized] = useState(false);

    // The live camera, for flights, in a ref: as state it re-rendered every pin
    // at the end of every pan. Clustering reads `clusterRegion`, which moves
    // only when the zoom does — the grid's cells are absolute, so a pan at the
    // same zoom yields the same clusters and has nothing to recompute.
    // Null until the map has a real camera. `initialRegion` is not one — Android
    // stretches it to the screen's aspect — and Google Maps fires no
    // region-change event on load, so `handleMapReady` reads the camera once.
    const regionRef = useRef(DEFAULT_REGION);
    const [clusterRegion, setClusterRegion] = useState(null);
    const handleMapReady = useCallback(async () => {
        setMapReady(true);
        try {
            const { northEast, southWest } = await mapRef.current.getMapBoundaries();
            const next = {
                latitude: (northEast.latitude + southWest.latitude) / 2,
                longitude: (northEast.longitude + southWest.longitude) / 2,
                latitudeDelta: Math.abs(northEast.latitude - southWest.latitude),
                longitudeDelta: Math.abs(northEast.longitude - southWest.longitude),
            };
            regionRef.current = next;
            setClusterRegion((prev) => prev ?? next);
        } catch {
            setClusterRegion((prev) => prev ?? regionRef.current);
        }
    }, []);

    const handleRegionChange = useCallback((next) => {
        regionRef.current = next;
        setClusterRegion((prev) => (
            prev && Math.abs(Math.log(next.longitudeDelta / prev.longitudeDelta)) < RECLUSTER_ZOOM_STEP ? prev : next
        ));
    }, []);
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
    // `EMPTY`, never a `[]` literal: a fresh array on every render rebuilt the
    // filtered list, so the clusters, so every pin's bitmap — on each pan
    // event, GPS fix and carousel swipe.
    const {
        selectedCategories: routeCategories = EMPTY,
        priceRange: routePriceRange = null,
        locationFilter: routeLocationFilter = null
    } = route?.params || {};
    const selectedCategories = routeFiltersCleared ? EMPTY : routeCategories;
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
            // The camera move is decided once posts have loaded — see the
            // first-fix effect below. Jumping here unconditionally put a user
            // standing in a listing-free district on a 2km blank map beside a
            // "112 зар" badge.
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

    // `isLoading`, not `isFetching`: the overlay is for a map with nothing on it
    // yet. Every post event refetches this query, and the overlay used to drop
    // over a map full of pins mid-use; a manual refresh has its button spinner.
    const { data: mapData, isLoading: loading, refetch: refetchPosts, isError: postsError } = useQuery({
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


    // react-native-maps rasterises a custom marker child once and then stops
    // watching it. Mounting with tracksViewChanges={false} means that snapshot
    // is taken before the child has laid out, so on Android every pin came out
    // empty. Track for one beat after the marker set changes, then stop. While
    // tracking, every pin is re-rasterised each frame, so the set must change
    // only when the pins do: it used to change on every render (a `[]` default
    // param) and at the end of every pan — 51% janky frames and a 150ms
    // 90th-percentile frame while panning on the A51, and marker taps that did
    // not register. Now it changes with the zoom or the filters: 7%, 19ms.
    const [tracksMarkers, setTracksMarkers] = useState(true);

    const clusters = useMemo(() => {
        if (!clusterRegion) return EMPTY;
        if (!mapPreferences.clusterMarkers || filteredPosts.length === 0) {
            return filteredPosts.map(post => ({
                posts: [post],
                coordinate: post.coordinates,
                count: 1,
                id: `single-${post.post_type}-${post.id}`,
                dominant: post.post_type,
            }));
        }
        return gridCluster(filteredPosts, clusterRegion);
    }, [filteredPosts, mapPreferences.clusterMarkers, clusterRegion]);

    useEffect(() => {
        if (clusters.length === 0) return undefined;
        setTracksMarkers(true);
        const timer = setTimeout(() => setTracksMarkers(false), 900);
        return () => clearTimeout(timer);
        // isDark too: the pin glyph colour flips with the theme, and a pin
        // rasterised under the old one would keep it until the next zoom.
    }, [clusters, isDark]);


    // First GPS fix: recentre on the user only if there is anything to see
    // there. Otherwise the default region (Ulaanbaatar, where the listings are)
    // is a better first frame than the user's own empty neighbourhood.
    useEffect(() => {
        if (firstFixDoneRef.current) return;
        if (!mapReady || !userLocation || !mapRef.current) return;
        if (loading) return;
        firstFixDoneRef.current = true;
        const nearby = mapService.filterByLocationRadius(
            filteredPosts, userLocation, FIRST_FIX_RADIUS_KM,
        );
        if (nearby.length === 0) return;
        // Frame the user together with what is near them: a fixed 2 km box
        // around the user usually held none of the listings that justified
        // moving there, so the map opened on an empty street.
        mapRef.current.fitToCoordinates(
            [userLocation, ...nearby.map((p) => p.coordinates)],
            { edgePadding: FIT_PADDING, animated: true },
        );
    }, [mapReady, userLocation, loading, filteredPosts]);

    // Camera flight to a tapped pin. The target sits in the upper part of the
    // viewport so the carousel pinned at the bottom does not cover it; a
    // cluster also zooms in one step so its members start to separate.
    const flyTo = useCallback((coordinate, zoomIn = false) => {
        if (!mapRef.current || !mapReady) return;
        const region = regionRef.current;
        const latitudeDelta = zoomIn ? region.latitudeDelta / 2.5 : region.latitudeDelta;
        const longitudeDelta = zoomIn ? region.longitudeDelta / 2.5 : region.longitudeDelta;
        mapRef.current.animateToRegion({
            latitude: coordinate.latitude - latitudeDelta * 0.22,
            longitude: coordinate.longitude,
            latitudeDelta,
            longitudeDelta,
        }, animations.duration.camera);
    }, [mapReady]);

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
        if (!mapRef.current || !mapReady) return;

        // The listings themselves, not the clusters on screen: a cluster's
        // centroid depends on the current zoom, so fitting centroids framed
        // a different area each time the button was pressed.
        const coordinates = filteredPosts
            .map((p) => p.coordinates)
            .filter((c) => Number.isFinite(c?.latitude) && Number.isFinite(c?.longitude));
        if (coordinates.length === 0) return;
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

        mapRef.current.fitToCoordinates(coordinates, { edgePadding: FIT_PADDING, animated: true });
    }, [filteredPosts, userLocation, mapReady]);

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

    // Badge wears the dominant category's colour so a cluster of tool rentals
    // and a cluster of job ads differ before the tap. `dominant` may be a schema
    // colour that was never tuned for a white ring, so the count itself sits on
    // a white disc — legible on any hue.
    const renderClusterMarker = (cluster) => {
        const single = cluster.count === 1;
        const tint = getMarkerColor(single ? cluster.posts[0].post_type : cluster.dominant);
        return (
            <MapPin
                key={cluster.id}
                cluster={cluster}
                onPress={handleClusterPress}
                tint={tint}
                icon={single ? getMarkerIcon(cluster.posts[0].post_type) : undefined}
                iconColor={colors.text.onColor}
                label={single ? undefined : cluster.count > 999 ? '1k+' : String(cluster.count)}
                textColor={single ? undefined : toneForTheme(tint, false)}
                styles={styles}
                accessibilityLabel={single ? undefined : t('map.clusterLabel', { count: cluster.count })}
                tracks={tracksMarkers}
            />
        );
    };

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
                        <TouchableOpacity activeOpacity={interactions.activeOpacity}
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

                        <TouchableOpacity activeOpacity={interactions.activeOpacity}
                            style={styles.mapHeaderBtn}
                            onPress={() => dispatchUi({ type: 'SHOW_SETTINGS' })}
                            hitSlop={interactions.hitSlop}
                            accessibilityRole="button"
                            accessibilityLabel={t('map.settings')}
                        >
                            <Ionicons name="settings-outline" size={20} color={colors.iconAccent} />
                        </TouchableOpacity>

                        <TouchableOpacity activeOpacity={interactions.activeOpacity}
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
                    onMapReady={handleMapReady}
                    provider={PROVIDER_GOOGLE}
                    showsUserLocation={true}
                    showsMyLocationButton={false}
                    showsCompass={true}
                    showsTraffic={mapPreferences.showTraffic}
                    showsPointsOfInterest={false}
                    customMapStyle={mapStyleFor(isDark)}
                    loadingBackgroundColor={colors.background}
                    loadingIndicatorColor={colors.iconAccent}
                    mapType={mapPreferences.mapType}
                    toolbarEnabled={false}
                    pitchEnabled={true}
                    rotateEnabled={true}
                    scrollEnabled={true}
                    zoomEnabled={true}
                    loadingEnabled={true}
                    moveOnMarkerPress={false}
                    onRegionChangeComplete={handleRegionChange}
                >
                    {clusters.map(cluster => renderClusterMarker(cluster))}
                </MapView>

                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color={colors.iconAccent} />
                        <Text style={styles.loadingText}>{t('common.loading')}</Text>
                    </View>
                )}

                {(() => {
                    // The tab bar is laid out below the map, so the buttons
                    // and the rail only need to clear the map's own edge.
                    const base = listBottom;
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
                                <Ionicons name="locate" size={20} color={colors.iconAccent} />
                            </PressableScale>

                            <PressableScale
                                style={[styles.floatingButton, { bottom: base + lift + 60, right: spacing.lg }]}
                                onPress={fitToMarkers}
                                accessibilityRole="button"
                                accessibilityLabel={t('map.autoFit')}
                            >
                                <Ionicons name="expand" size={20} color={colors.iconAccent} />
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
                        trackColor={{ false: colors.switch.track, true: colors.primary }}
                        thumbColor={colors.switch.thumb}
                    />
                </View>

                <View style={[styles.settingItem, { borderBottomColor: colors.border.light }]}>
                    <Text style={[styles.settingLabel, { color: colors.text.primary }]}>{t('map.autoFit')}</Text>
                    <Switch
                        value={mapPreferences.autoFitMarkers}
                        onValueChange={(value) => updatePreference('autoFitMarkers', value)}
                        trackColor={{ false: colors.switch.track, true: colors.primary }}
                        thumbColor={colors.switch.thumb}
                    />
                </View>

                <View style={[styles.settingItem, { borderBottomColor: colors.border.light }]}>
                    <Text style={[styles.settingLabel, { color: colors.text.primary }]}>{t('map.showTraffic')}</Text>
                    <Switch
                        value={mapPreferences.showTraffic}
                        onValueChange={(value) => updatePreference('showTraffic', value)}
                        trackColor={{ false: colors.switch.track, true: colors.primary }}
                        thumbColor={colors.switch.thumb}
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

// Pins and the count badge are fixed in both modes: a white ring separates a
// category colour from either map ground (same idiom as the web `.map-pin`),
// and amber is the dark-palette primary, the brightest accent. The *chrome*
// around the map — the two round buttons and the loading scrim — follows the
// app theme, now that the tiles do too (`mapStyleFor`).
const MAP_OVERLAY = {
    accent: '#F5A623',
    onAccent: '#1A1200',
    surface: '#FFFFFF',
    shadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
};

const createStyles = (colors) => StyleSheet.create({
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
        borderRadius: radius.badge,
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
    // No shadow on either marker: there is no room in the bitmap for one (see
    // MARKER_MAX_DP), and the white ring already separates on both grounds.
    singleMarkerContainer: {
        width: PIN_SIZE,
        height: PIN_SIZE,
        borderRadius: radius.pill,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: MAP_OVERLAY.surface,
    },
    clusterMarkerContainer: {
        backgroundColor: MAP_OVERLAY.accent,
        borderRadius: radius.pill,
        width: CLUSTER_SIZE,
        height: CLUSTER_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: MAP_OVERLAY.surface,
    },
    // Explicit size: 2dp white border + a 3dp ring of the category colour.
    clusterDisc: {
        width: CLUSTER_SIZE - 10,
        height: CLUSTER_SIZE - 10,
        borderRadius: radius.pill,
        backgroundColor: MAP_OVERLAY.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    clusterText: { ...typography.styles.labelStrong, fontVariant: ['tabular-nums'] },
    // Three characters at most (`1k+` past 999) so the 12px badge role fits the
    // fixed disc; it is the type that steps down, never the circle that grows.
    clusterTextLong: { ...typography.styles.badge },
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
        backgroundColor: withAlpha(colors.background, 0.75),
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: spacing.sm,
        ...typography.styles.caption,
        color: colors.text.primary,
    },
    floatingButton: {
        ...MAP_OVERLAY.shadow,
        position: 'absolute',
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border.light,
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
        borderRadius: radius.card,
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
        borderRadius: radius.pill,
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
});

export default CustomerMapView;