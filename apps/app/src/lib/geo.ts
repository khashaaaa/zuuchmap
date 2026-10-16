import { useCallback, useSyncExternalStore } from 'react';
import * as Location from 'expo-location';

/** Ulaanbaatar centre: the fallback when location is off. */
export const UB = { lat: 47.918, lng: 106.917 } as const;

export type GeoStatus = 'unknown' | 'granted' | 'denied';
export interface GeoState {
  status: GeoStatus;
  coords: { lat: number; lng: number } | null;
  asked: boolean;
}

let state: GeoState = { status: 'unknown', coords: null, asked: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (next: GeoState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

async function locate(): Promise<void> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) set({ status: 'granted', coords: { lat: last.coords.latitude, lng: last.coords.longitude }, asked: true });
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    set({ status: 'granted', coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, asked: true });
  } catch {
    // Permission was granted but no fix (GPS off): keep any last-known position, the screen shows the UB fallback.
    if (!state.coords) set({ ...state, status: 'denied', asked: true });
  }
}

/** Ask once per run (the system remembers a refusal); safe to call from every screen that needs a position. */
function requestLocation(force = false): Promise<void> {
  if (inflight) return inflight;
  if (state.asked && !force) return Promise.resolve();
  inflight = (async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      let granted = perm.granted;
      if (!granted && (perm.canAskAgain || force)) granted = (await Location.requestForegroundPermissionsAsync()).granted;
      if (granted) await locate();
      else set({ status: 'denied', coords: null, asked: true });
    } catch {
      set({ status: 'denied', coords: null, asked: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The current fix, read outside render (right after `ask`). */
export const getGeoState = (): GeoState => state;

export function useGeo() {
  const geo = useSyncExternalStore(subscribe, () => state, () => state);
  const ask = useCallback((force = false) => requestLocation(force), []);
  return { ...geo, ask };
}
