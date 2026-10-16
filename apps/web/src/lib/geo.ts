import { create } from 'zustand';

export const UB = { lat: 47.918, lng: 106.917 } as const;

export type GeoStatus = 'idle' | 'asking' | 'granted' | 'denied' | 'unavailable';

interface GeoState {
  status: GeoStatus;
  coords: { lat: number; lng: number } | null;
  request: () => void;
}

let asked = false;

/** Location is asked once per session, only when the map or SOS opens; Ulaanbaatar is the fallback. */
export const useGeo = create<GeoState>((set) => ({
  status: 'idle',
  coords: null,
  request: () => {
    if (asked) return;
    asked = true;
    if (!('geolocation' in navigator)) {
      set({ status: 'unavailable' });
      return;
    }
    set({ status: 'asking' });
    navigator.geolocation.getCurrentPosition(
      (p) => set({ status: 'granted', coords: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      (e) => set({ status: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { timeout: 8000, maximumAge: 300000 },
    );
  },
}));

/** Ask again after the user allowed it in the browser (the "Зөвшөөрөх" action). */
export function retryGeo(): void {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (p) => useGeo.setState({ status: 'granted', coords: { lat: p.coords.latitude, lng: p.coords.longitude } }),
    () => undefined,
    { timeout: 8000 },
  );
}
