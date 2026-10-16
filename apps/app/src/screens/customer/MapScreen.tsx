import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Linking, Platform, Pressable, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { formatPriceParts, type ListingListItem, type MapCluster, type MapPin as MapPinData } from '@zuuchmap/core';
import { useAppTheme } from '../../design/theme';
import { type BrowseState } from '../../lib/browse';
import { UB, useGeo } from '../../lib/geo';
import { useListing, useMapData } from '../../lib/queries';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { MapPin } from '../../ui/MapPin';
import { useLocale } from '../../ui/useLocale';
import { ListingRow } from './ListingRow';

interface Box { w: number; s: number; e: number; n: number }
const toBox = (r: Region): Box => ({ w: r.longitude - r.longitudeDelta / 2, e: r.longitude + r.longitudeDelta / 2, s: r.latitude - r.latitudeDelta / 2, n: r.latitude + r.latitudeDelta / 2 });
const toZoom = (r: Region) => Math.log2(360 / r.longitudeDelta);


export interface MapScreenProps {
  state: BrowseState;
  items: ListingListItem[];
  onOpen: (item: ListingListItem) => void;
  isSaved: (id: number) => boolean;
  onToggleSave: (item: ListingListItem) => void;
  /** Space the header chips take above the map. */
  top: number;
}

/** B1 / C9: the map, grid clusters from the engine, the "search this area" button and the card carousel. */
export function MapScreen({ state, items, onOpen, isSaved, onToggleSave, top }: MapScreenProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const geo = useGeo();
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<ListingListItem>>(null);
  const { width, height } = Dimensions.get('window');

  const initial = useMemo<Region>(() => {
    const latD = 0.12;
    return { latitude: UB.lat, longitude: UB.lng, latitudeDelta: latD, longitudeDelta: latD * (width / Math.max(300, height - top)) };
  }, [width, height, top]);
  const [applied, setApplied] = useState<{ box: Box; zoom: number }>(() => ({ box: toBox(initial), zoom: toZoom(initial) }));
  const [moved, setMoved] = useState<Region | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [points, setPoints] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    void geo.ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ask once when the map opens
  }, []);

  const data = useMapData(state, applied.box, applied.zoom);
  const pins = useMemo(() => data.data?.pins ?? [], [data.data]);
  const clusters = useMemo(() => data.data?.clusters ?? [], [data.data]);
  const pinIds = useMemo(() => new Set(pins.map((p) => p.id)), [pins]);

  const carousel = useMemo(() => items.filter((i) => pinIds.has(i.id)), [items, pinIds]);
  const missing = selected !== null && !carousel.some((i) => i.id === selected);
  const extra = useListing(missing && selected !== null ? selected : 0);
  const cards = useMemo(() => (missing && extra.data ? [extra.data, ...carousel] : carousel), [missing, extra.data, carousel]);

  // Screen position of every pin; re-run while the map moves (throttled) and when the data changes.
  const busy = useRef(false);
  const reproject = useCallback(async () => {
    const map = mapRef.current;
    if (!map || busy.current) return;
    busy.current = true;
    try {
      const entries = await Promise.all([
        ...clusters.map(async (c) => [`c${c.id}`, await map.pointForCoordinate({ latitude: c.lat, longitude: c.lng })] as const),
        ...pins.map(async (p) => [`p${p.id}`, await map.pointForCoordinate({ latitude: p.lat, longitude: p.lng })] as const),
      ]);
      setPoints(Object.fromEntries(entries));
    } catch {
      /* the map is not ready yet; the next move retries */
    } finally {
      busy.current = false;
    }
  }, [clusters, pins]);
  useEffect(() => {
    const id = setTimeout(() => void reproject(), 150);
    return () => clearTimeout(id);
  }, [reproject]);

  const cardW = width - 48;
  const select = useCallback(
    (id: number) => {
      setSelected(id);
      const idx = cards.findIndex((c) => c.id === id);
      if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true });
    },
    [cards],
  );

  const searchHere = () => {
    if (!moved) return;
    setApplied({ box: toBox(moved), zoom: toZoom(moved) });
    setMoved(null);
  };

  const zoomInto = (c: MapCluster) => {
    const cur = moved ?? initial;
    const next: Region = { latitude: c.lat, longitude: c.lng, latitudeDelta: cur.latitudeDelta / 2.5, longitudeDelta: cur.longitudeDelta / 2.5 };
    mapRef.current?.animateToRegion(next, 350);
    setApplied({ box: toBox(next), zoom: toZoom(next) });
    setMoved(null);
  };

  const myLocation = async () => {
    await geo.ask(true);
  };
  useEffect(() => {
    if (geo.coords && geo.status === 'granted' && !moved) {
      const r: Region = { latitude: geo.coords.lat, longitude: geo.coords.lng, latitudeDelta: initial.latitudeDelta, longitudeDelta: initial.longitudeDelta };
      mapRef.current?.animateToRegion(r, 400);
      setApplied({ box: toBox(r), zoom: toZoom(r) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recentre when the first fix arrives
  }, [geo.coords?.lat, geo.coords?.lng]);

  const denied = geo.asked && geo.status === 'denied';
  const carouselBottom = 12;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSurfaceSunken }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initial}
        showsUserLocation={geo.status === 'granted'}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onMapReady={() => void reproject()}
        onRegionChange={() => void reproject()}
        onRegionChangeComplete={(r, details) => {
          if (details?.isGesture) setMoved(r);
          void reproject();
        }}
        onPress={() => setSelected(null)}
      >
      </MapView>

      {/* Pins are plain views over the map, not Marker bitmaps: Android rasterises a marker into ~100 px, which clips a full price. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        {clusters.map((c) => {
          const at = points[`c${c.id}`];
          return at ? (
            <View key={`c${c.id}`} pointerEvents="box-none" style={{ position: 'absolute', left: at.x - 100, width: 200, top: at.y - 22, alignItems: 'center' }}>
              <Pressable onPress={() => zoomInto(c)} accessibilityRole="button" accessibilityLabel={t('map.clusterLabel', { count: c.count })}>
                <MapPin kind="cluster" label={String(c.count)} />
              </Pressable>
            </View>
          ) : null;
        })}
        {pins.map((p: MapPinData) => {
          const at = points[`p${p.id}`];
          if (!at) return null;
          const label = p.price_amount !== null ? (formatPriceParts(p.price_amount, p.price_unit, locale)?.amount ?? '–') : '–';
          return (
            <View key={`p${p.id}`} pointerEvents="box-none" style={{ position: 'absolute', left: at.x - 100, width: 200, top: at.y - 44, alignItems: 'center', zIndex: selected === p.id ? 2 : 1 }}>
              <Pressable onPress={() => select(p.id)} accessibilityRole="button" accessibilityLabel={label}>
                <MapPin kind={selected === p.id ? 'selected' : 'price'} label={label} />
              </Pressable>
            </View>
          );
        })}
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 16, right: 16, alignItems: 'center', gap: 8 }}>
        {denied ? (
          <View style={{ alignSelf: 'stretch' }}>
            <Banner
              tone="info"
              title={t('customer.map.locationOff')}
              body={t('customer.map.locationOffBody')}
              actionLabel={t('customer.map.allow')}
              onAction={() => void geo.ask(true).then(() => Linking.openSettings().catch(() => undefined))}
            />
          </View>
        ) : null}
        {moved ? <Button label={t('customer.map.searchHere')} icon="refresh-cw" variant="outline" size="medium" onPress={searchHere} style={{ backgroundColor: colors.bgSurface, borderRadius: 9999 }} /> : null}
      </View>

      <View style={{ position: 'absolute', right: 16, bottom: carouselBottom + (cards.length ? 150 : 0) + 8 }}>
        <IconButton icon="locate" label={t('posts.sectionLocation')} onPress={() => void myLocation()} />
      </View>

      {cards.length > 0 ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: carouselBottom }}>
          <FlatList
            ref={listRef}
            data={cards}
            horizontal
            keyExtractor={(i) => String(i.id)}
            snapToInterval={cardW + 12}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            getItemLayout={(_d, index) => ({ length: cardW + 12, offset: (cardW + 12) * index, index })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (cardW + 12));
              const c = cards[idx];
              if (c) {
                setSelected(c.id);
                if (c.latitude !== null && c.longitude !== null) mapRef.current?.animateToRegion({ latitude: c.latitude, longitude: c.longitude, latitudeDelta: (moved ?? initial).latitudeDelta, longitudeDelta: (moved ?? initial).longitudeDelta }, 300);
              }
            }}
            renderItem={({ item }) => (
              <View style={{ width: cardW }}>
                <ListingRow item={item} dates={{ from: state.date_from, to: state.date_to }} saved={isSaved(item.id)} onToggleSave={onToggleSave} onOpen={onOpen} showDistance />
              </View>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}
