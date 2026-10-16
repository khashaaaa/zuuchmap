import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthResponse, AuthUser } from '@zuuchmap/core';

const AUTH_KEY = 'zm_auth';
const DEVICE_KEY = 'zm_device';

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** The stored session has been read; before this, "guest" is not yet known. */
  ready: boolean;
}

let state: AuthState = { token: null, user: null, ready: false };
let deviceId: string | null = null;
const listeners = new Set<() => void>();
const set = (next: AuthState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getToken = (): string | null => state.token;
export const getAuth = (): AuthState => state;
export const useAuth = (): AuthState => useSyncExternalStore(subscribe, getAuth, getAuth);

const randomId = () => `d${Date.now().toString(36)}${Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('')}`;

/** A random id generated once and persisted; it is also the anonymous visitor id for view counting. */
export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY);
    if (stored) {
      deviceId = stored;
      return stored;
    }
  } catch {
    /* fall through to a fresh id */
  }
  deviceId = randomId();
  AsyncStorage.setItem(DEVICE_KEY, deviceId).catch(() => undefined);
  return deviceId;
}

/** Startup never waits on the network: a stored token opens the app at once. */
export async function loadAuth(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser };
      if (parsed.token && parsed.user) {
        set({ token: parsed.token, user: parsed.user, ready: true });
        return;
      }
    }
  } catch {
    /* a corrupt value reads as signed out */
  }
  set({ token: null, user: null, ready: true });
}

export async function setAuth(auth: AuthResponse): Promise<void> {
  set({ token: auth.token, user: auth.user, ready: true });
  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ token: auth.token, user: auth.user })).catch(() => undefined);
}

/** The engine changed the account's role (a first listing makes a provider): keep the stored session in step. */
export async function patchUser(patch: Partial<AuthUser>): Promise<void> {
  if (!state.token || !state.user) return;
  const user = { ...state.user, ...patch };
  set({ ...state, user });
  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ token: state.token, user })).catch(() => undefined);
}

/** Forgets the session locally (a 401, or after `signOut` told the engine); the phone stays trusted. */
export async function clearAuth(): Promise<void> {
  set({ token: null, user: null, ready: true });
  await AsyncStorage.removeItem(AUTH_KEY).catch(() => undefined);
}
