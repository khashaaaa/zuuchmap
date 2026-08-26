import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, LocateFixed, RefreshCw, Layers, X } from 'lucide-react'
import { postsApi, categoryApi } from '@/lib/api'
import { getCategoryColor, getPostCategory, toneForTheme } from '@/lib/utils'
import { categoryPin, clusterPin } from '@/lib/mapPin'
import {
  gridCluster, noCluster, filterByCategories, filterByPriceRange,
  filterByLocationRadius, activeFilterCount, EMPTY_FILTERS,
} from '@/lib/mapCluster'
import MapFilterModal from '@/components/MapFilterModal'
import MapClusterCarousel from '@/components/MapClusterCarousel'
import ErrorState from '@/components/ErrorState'
import EmptyState from '@/components/EmptyState'
import Button from '@/components/Button'
import { useThemeStore } from '@/store'

const UB = [47.9184676, 106.9177016]
const DEFAULT_ZOOM = 12

/**
 * Reports the viewport to the page on every move, and hands back the map
 * instance for camera flights. react-leaflet exposes both only from inside
 * `MapContainer`, so this rides along as a child rather than a hook up top.
 */
function MapBridge({ onViewport, onReady }) {
  const map = useMap()
  const emit = useCallback(() => {
    const b = map.getBounds()
    onViewport({
      latDelta: Math.abs(b.getNorth() - b.getSouth()),
      lngDelta: Math.abs(b.getEast() - b.getWest()),
    })
  }, [map, onViewport])

  useMapEvents({ moveend: emit, zoomend: emit, load: emit })
  // Handing the instance up is a side effect, so it waits for commit; the
  // first viewport report rides along with it.
  useEffect(() => { onReady(map); emit() }, [map, onReady, emit])
  return null
}

export default function CustomerMap() {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const mapRef = useRef(null)
  const setMap = useCallback((m) => { mapRef.current = m }, [])

  const [viewport, setViewport] = useState({ latDelta: 0.09, lngDelta: 0.16 })
  const [carouselPosts, setCarouselPosts] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [clusterMarkers, setClusterMarkers] = useState(true)
  const [userLocation, setUserLocation] = useState(null)
  const [locating, setLocating] = useState(false)

  const { data: posts = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['posts-map'],
    queryFn: postsApi.getMap,
    staleTime: 60_000,
  })

  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })

  // Non-location filters. Kept apart from the radius pass so a GPS update does
  // not recompute category/price work that did not change — same split the app
  // makes in `CustomerMapView`.
  const baseFiltered = useMemo(() => {
    let out = posts
    if (filters.selectedCategories?.length) out = filterByCategories(out, filters.selectedCategories)
    if (filters.priceRange?.enabled) out = filterByPriceRange(out, filters.priceRange)
    return out
  }, [posts, filters.selectedCategories, filters.priceRange])

  const filtered = useMemo(() => {
    if (filters.locationFilter?.enabled && userLocation) {
      return filterByLocationRadius(baseFiltered, userLocation, filters.locationFilter.radius)
    }
    return baseFiltered
  }, [baseFiltered, filters.locationFilter, userLocation])

  const clusters = useMemo(
    () => (clusterMarkers ? gridCluster(filtered, viewport) : noCluster(filtered)),
    [filtered, clusterMarkers, viewport]
  )

  const filterCount = activeFilterCount(filters)

  /**
   * Camera flight to a tapped pin. A cluster also zooms in one step so its
   * members start to separate; the target sits above centre so the carousel
   * pinned at the bottom does not cover it.
   */
  const focusCluster = useCallback((cluster) => {
    const map = mapRef.current
    setCarouselPosts(cluster.posts)
    if (!map) return
    const { latitude, longitude } = cluster.coordinate
    const zoom = cluster.count > 1 ? Math.min(map.getZoom() + 2, 18) : map.getZoom()
    // Nudge north so the pin lands in the upper half, clear of the rail.
    const span = Math.abs(map.getBounds().getNorth() - map.getBounds().getSouth())
    map.flyTo([latitude - span * 0.15, longitude], zoom, { duration: 0.6 })
  }, [])

  const locate = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const here = { latitude: coords.latitude, longitude: coords.longitude }
        setUserLocation(here)
        setLocating(false)
        mapRef.current?.flyTo([here.latitude, here.longitude], 14, { duration: 0.6 })
      },
      // A refused or unavailable fix is not an error state for the map — the
      // pins are still there, so the button just stops spinning.
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 }
    )
  }, [])

  if (isLoading) return <div className="h-[calc(100vh-8rem)] skeleton rounded-card" />
  // An empty map and an unreachable engine look identical once the pins are gone.
  if (isError) return <ErrorState onRetry={refetch} />

  const overlayBtn = 'w-10 h-10 grid place-items-center rounded-full bg-surface/95 backdrop-blur shadow-card border border-border/20 text-muted hover:text-text transition-colors'

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => setShowFilters(true)}
          className="relative inline-flex items-center gap-2 min-h-[40px] px-3 rounded-btn border border-border/20 bg-surface text-sm font-medium text-text hover:border-border transition-colors">
          <SlidersHorizontal size={16} aria-hidden="true" />
          {t('common.filter')}
          {filterCount > 0 && (
            <span className="ml-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-primary text-on-primary text-[11px] font-semibold tabular-nums">
              {filterCount}
            </span>
          )}
        </button>
        <span className="text-xs text-muted">{t('common.total', { count: filtered.length })}</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setClusterMarkers((v) => !v)} aria-pressed={clusterMarkers}
            title={t('map.clusterMarkers')} aria-label={t('map.clusterMarkers')}
            className={`w-10 h-10 grid place-items-center rounded-btn border transition-colors ${
              clusterMarkers ? 'border-primary text-primary-text' : 'border-border/20 text-muted hover:text-text'
            }`}>
            <Layers size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => refetch()} title={t('map.refresh')} aria-label={t('map.refresh')}
            className="w-10 h-10 grid place-items-center rounded-btn border border-border/20 text-muted hover:text-text transition-colors">
            <RefreshCw size={16} aria-hidden="true" className={isFetching ? 'animate-spin' : undefined} />
          </button>
        </div>
      </div>

      <div className="relative rounded-card overflow-hidden border border-border/20 shadow-card h-[calc(100vh-11rem)] min-h-[420px]">
        <MapContainer center={UB} zoom={DEFAULT_ZOOM} style={{ height: '100%', width: '100%' }} zoomControl>
          <TileLayer
            key={theme}
            url={`https://{s}.basemaps.cartocdn.com/${isDark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          />
          <MapBridge onViewport={setViewport} onReady={setMap} />

          {filters.locationFilter?.enabled && userLocation && (
            <Circle
              center={[userLocation.latitude, userLocation.longitude]}
              radius={filters.locationFilter.radius * 1000}
              pathOptions={{ className: 'map-radius' }}
            />
          )}

          {clusters.map((cluster) => {
            const hex = getCategoryColor(cluster.dominant, schemas)
            return (
              <Marker
                key={cluster.id}
                position={[cluster.coordinate.latitude, cluster.coordinate.longitude]}
                icon={cluster.count > 1
                  ? clusterPin(hex, cluster.count, toneForTheme(hex, false))
                  : categoryPin(getCategoryColor(getPostCategory(cluster.posts[0]), schemas))}
                alt={cluster.count > 1 ? t('map.clusterLabel', { count: cluster.count }) : undefined}
                eventHandlers={{ click: () => focusCluster(cluster) }}
              />
            )
          })}
        </MapContainer>

        <div className="absolute right-3 bottom-3 z-[500] flex flex-col gap-2">
          <button type="button" onClick={locate} className={overlayBtn}
            title={t('map.myLocation')} aria-label={t('map.myLocation')}>
            <LocateFixed size={18} aria-hidden="true" className={locating ? 'animate-pulse' : undefined} />
          </button>
        </div>

        {/* `pointer-events-none` on the wrapper keeps the map draggable behind
            the card; the card itself takes events back so its action is
            clickable. Without the branch on filterCount this told a user who
            had filtered everything out that the catalogue was empty, and
            offered nothing to click either way. Mirrors CustomerBrowse. */}
        {filtered.length === 0 && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[500] px-6 pointer-events-none">
            <div className="max-w-sm mx-auto bg-surface/95 backdrop-blur rounded-card shadow-card p-4 pointer-events-auto">
              <EmptyState
                title={t(filterCount > 0 ? 'posts.noMatches' : 'posts.browseEmpty')}
                description={t(filterCount > 0 ? 'posts.noMatchesDesc' : 'posts.browseEmptyDesc')}
                action={filterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                    <X size={13} /> {t('common.clear')}
                  </Button>
                ) : undefined}
              />
            </div>
          </div>
        )}

        {carouselPosts && (
          <MapClusterCarousel posts={carouselPosts} onClose={() => setCarouselPosts(null)} />
        )}
      </div>

      <MapFilterModal
        open={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={setFilters}
        posts={posts}
        schemas={schemas}
        value={filters}
      />
    </>
  )
}
