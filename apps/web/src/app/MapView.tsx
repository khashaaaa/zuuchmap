import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { retryGeo, UB, useGeo } from '@/lib/geo';
import { useBrowseOnce, useMapPins } from '@/lib/queries';
import { searchToApi, type SearchState } from '@/lib/search';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { MapPin } from '@/ui/MapPin';
import { ListingRow } from './ListingRow';

interface View { bbox: string; zoom: number }

function Reporter({ onView }: { onView: (v: View, user: boolean) => void }) {
  const map = useMap();
  const cb = useRef(onView);
  useEffect(() => {
    cb.current = onView;
  });
  const report = useCallback(
    (user: boolean) => {
      const b = map.getBounds();
      cb.current({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(','), zoom: map.getZoom() }, user);
    },
    [map],
  );
  useEffect(() => report(false), [report]);
  useMapEvents({ moveend: () => report(true) });
  return null;
}

function Recenter({ to }: { to: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.setView([to.lat, to.lng], Math.max(map.getZoom(), 12));
  }, [to, map]);
  return null;
}

const wrap = (html: string, anchor: 'bottom' | 'center') =>
  `<div style="transform:translate(-50%,${anchor === 'bottom' ? '-100%' : '-50%'});width:max-content">${html}</div>`;

function Pins({ data, selected, onSelect }: { data: { pins: { id: number; lat: number; lng: number; price_amount: string | number | null }[]; clusters: { id: string; lat: number; lng: number; count: number }[] }; selected: number | null; onSelect: (id: number) => void }) {
  const map = useMap();
  const icons = useMemo(
    () => ({
      pin: (price: string | number | null, on: boolean) =>
        divIcon({ className: 'zm-marker', iconSize: [0, 0], html: wrap(renderToStaticMarkup(<MapPin variant={on ? 'selected' : 'price'} price={price ?? 0} />), 'bottom') }),
      cluster: (n: number) => divIcon({ className: 'zm-marker', iconSize: [0, 0], html: wrap(renderToStaticMarkup(<MapPin variant="cluster" count={n} />), 'center') }),
    }),
    [],
  );
  return (
    <>
      {data.clusters.map((c) => (
        <Marker key={c.id} position={[c.lat, c.lng]} icon={icons.cluster(c.count)} eventHandlers={{ click: () => map.flyTo([c.lat, c.lng], Math.min(map.getZoom() + 2, 18)) }} />
      ))}
      {data.pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={icons.pin(p.price_amount, p.id === selected)} zIndexOffset={p.id === selected ? 1000 : 0} eventHandlers={{ click: () => onSelect(p.id) }} />
      ))}
    </>
  );
}

/** B1: Leaflet over OSM, pins with the full price, clusters with the count, a card carousel beneath. */
export default function MapView({ s, onFilter }: { s: SearchState; update: (p: Partial<SearchState>) => void; onFilter: () => void }) {
  const { t } = useTranslation();
  const geo = useGeo();
  const request = useGeo((g) => g.request);
  const [now, setNow] = useState<View | null>(null);
  const [searched, setSearched] = useState<View | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => request(), [request]);

  const filters = searchToApi({ ...s, sort: undefined }, null);
  const pins = useMapPins(filters, searched?.bbox ?? null, searched?.zoom ?? 12);
  const dates = s.date_from && s.date_to ? { from: s.date_from, to: s.date_to } : undefined;
  const list = useBrowseOnce(searchToApi({ ...s, sort: geo.coords ? 'nearby' : s.sort }, geo.coords), 30);

  const bounds = useMemo(() => {
    if (!searched) return null;
    const [w, so, e, n] = searched.bbox.split(',').map(Number);
    return { w, s: so, e, n };
  }, [searched]);
  const visible = (list.data?.items ?? []).filter((i) => bounds && i.latitude !== null && i.longitude !== null && i.longitude >= bounds.w && i.longitude <= bounds.e && i.latitude >= bounds.s && i.latitude <= bounds.n);
  const moved = !!now && !!searched && now.bbox !== searched.bbox;

  useEffect(() => {
    if (selected === null) return;
    rail.current?.querySelector(`[data-id="${selected}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selected]);

  const center = geo.coords ?? UB;
  return (
    <div className="flex flex-col gap-3">
      {(geo.status === 'denied' || geo.status === 'unavailable') && (
        <Banner tone="info" title={t('customer.map.locationOff')} body={t('customer.map.locationOffBody')} action={{ label: t('customer.map.allow'), onClick: retryGeo }} />
      )}
      <div className="relative isolate h-[calc(100dvh-300px)] min-h-[420px] overflow-hidden rounded-xl border border-border-subtle lg:h-[calc(100dvh-220px)]">
        <MapContainer center={[center.lat, center.lng]} zoom={12} scrollWheelZoom className="size-full" zoomControl={false}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
          <Reporter onView={(v, user) => { setNow(v); setSearched((cur) => (cur === null && !user ? v : cur)); }} />
          <Recenter to={geo.coords} />
          {pins.data && <Pins data={pins.data} selected={selected} onSelect={setSelected} />}
        </MapContainer>
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center">
          {moved && (
            <Button size="medium" variant="outline" icon="refresh-cw" className="pointer-events-auto bg-bg-surface shadow-md" onClick={() => { if (now) setSearched(now); setSelected(null); }}>
              {t('customer.map.searchHere')}
            </Button>
          )}
        </div>
        <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
          <IconButton icon="sliders-horizontal" label={t('customer.filter.title')} variant="surface" className="bg-bg-surface! shadow-md" onClick={onFilter} />
          <IconButton icon="locate" label={t('ui.myLocation')} variant="surface" className="bg-bg-surface! shadow-md" onClick={retryGeo} />
        </div>
        {visible.length > 0 && (
          <div ref={rail} className="absolute inset-x-0 bottom-0 z-[500] flex snap-x gap-3 overflow-x-auto px-3 pb-3 pt-2 zm-noscroll">
            {visible.map((it) => (
              <div key={it.id} data-id={it.id} onMouseEnter={() => setSelected(it.id)} className="w-[min(340px,86%)] shrink-0 snap-center">
                <ListingRow item={it} dates={dates} className={it.id === selected ? 'ring-2 ring-border-selected' : undefined} />
              </div>
            ))}
          </div>
        )}
      </div>
      {pins.data && <p className="sr-only" role="status">{t('customer.browse.countAll', { count: pins.data.total })}</p>}
    </div>
  );
}
