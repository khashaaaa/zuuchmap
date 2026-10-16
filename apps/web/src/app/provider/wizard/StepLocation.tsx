import { useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DISTRICT_CODES, PROVINCE_CODES, nearestPlace } from '@zuuchmap/core';
import { UB } from '@/lib/geo';
import { useErrorText } from '@/lib/provider';
import { useToast } from '@/lib/toast';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Select } from '@/ui/Select';
import { TextField } from '@/ui/TextField';
import { PreviewCard, type StepProps } from './shared';

type Pos = { lat: number; lng: number };

function Clicks({ onPick }: { onPick: (p: Pos) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Follow({ to }: { to: Pos | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.setView([to.lat, to.lng], Math.max(map.getZoom(), 14));
  }, [to, map]);
  return null;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** F4: province and district, address, and an optional map pin. */
export function StepLocation({ form, set, errors, cat }: StepProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const err = useErrorText();
  const pos: Pos | null = form.latitude !== null && form.longitude !== null ? { lat: form.latitude, lng: form.longitude } : null;
  const icon = useMemo(
    () => divIcon({ className: 'zm-marker', iconSize: [0, 0], html: `<div style="transform:translate(-50%,-100%);color:var(--color-action-primary)">${renderToStaticMarkup(<Icon name="map-pin" size={36} />)}</div>` }),
    [],
  );
  const put = (p: Pos) => set({ latitude: round(p.lat), longitude: round(p.lng) });
  const locate = () => {
    if (!('geolocation' in navigator)) {
      toast.error(t('provider.locationFail'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      // An empty province is pre-filled from the fix; a picked one is never overwritten.
      (r) => {
        put({ lat: r.coords.latitude, lng: r.coords.longitude });
        if (!form.province) {
          const p = nearestPlace(r.coords.latitude, r.coords.longitude);
          set({ province: p.province, district: p.district ?? '' });
        }
      },
      () => toast.error(t('provider.locationPermission')),
      { timeout: 8000 },
    );
  };

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-x-6">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2 text-text-primary">{t('prov.wizard.whereTitle')}</h2>
          <p className="text-caption text-text-secondary">{t('prov.wizard.whereBody')}</p>
        </div>
        <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
          <Select
            label={t('prov.wizard.province')}
            value={form.province || undefined}
            options={PROVINCE_CODES.map((c) => ({ value: c, label: t(`province.${c}`) }))}
            onChange={(v) => set({ province: v, district: v === 'ULAANBAATAR' ? form.district : '' })}
          />
          {errors.province && <p role="alert" className="-mt-2 text-small text-status-danger">{err(errors.province, t('prov.wizard.province'))}</p>}
          {form.province === 'ULAANBAATAR' && (
            <>
              <Select label={t('prov.wizard.district')} value={form.district || undefined} options={DISTRICT_CODES.map((c) => ({ value: c, label: t(`district.${c}`) }))} onChange={(v) => set({ district: v })} />
              {errors.district && <p role="alert" className="-mt-2 text-small text-status-danger">{err(errors.district, t('prov.wizard.district'))}</p>}
            </>
          )}
          <TextField label={t('prov.wizard.address')} value={form.address} maxLength={300} onChange={(e) => set({ address: e.target.value })} />
        </section>
        <section className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-4">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-caption text-text-secondary">{t('prov.wizard.pinHint')}</p>
            <Button variant="outline" size="medium" icon="locate" onClick={locate} className="shrink-0">{t('prov.wizard.useMyLocation')}</Button>
          </div>
          <div className="h-[240px] overflow-hidden rounded-lg border border-border-subtle">
            <MapContainer center={pos ?? UB} zoom={pos ? 14 : 11} className="size-full" scrollWheelZoom={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
              <Clicks onPick={put} />
              <Follow to={pos} />
              {pos && <Marker position={[pos.lat, pos.lng]} icon={icon} draggable eventHandlers={{ dragend: (e) => put((e.target as L.Marker).getLatLng()) }} />}
            </MapContainer>
          </div>
          {pos && <button type="button" onClick={() => set({ latitude: null, longitude: null })} className="self-start text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">{t('ui.prov.removePin')}</button>}
        </section>
      </div>
      <aside className="md:sticky md:top-6"><PreviewCard form={form} cat={cat} /></aside>
    </div>
  );
}
