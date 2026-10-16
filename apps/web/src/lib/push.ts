import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import type { Locale, NotificationSettingsUpdate, PushDeviceRequest, PushDeviceRemoveRequest, VapidKeyResponse } from '@zuuchmap/core';
import { api } from './api';
import { useAuthStore } from './auth';
import { useToast } from './toast';
import { useFormat } from './useFormat';

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied';

const LATER_KEY = 'zm_push_later';
const ENDPOINT_KEY = 'zm_push_endpoint';
/** `<user id>:<locale>` last sent to the engine, so a reload sends nothing. */
const LOCALE_SENT_KEY = 'zm_locale_sent';
/** After "later" the ask stays away this long. */
const PUSH_LATER_MS = 7 * 86_400_000;

const store = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

const supported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function pushPermission(): PushPermission {
  return supported() ? (Notification.permission as PushPermission) : 'unsupported';
}

/** The engine's VAPID public key, asked once; null when web push is not configured there. */
let vapid: Promise<string | null> | null = null;
const vapidKey = (): Promise<string | null> => (vapid ??= api<VapidKeyResponse>('/notifications/vapid-key').then((r) => r.key).catch(() => { vapid = null; return null; }));

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob((b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Re-reads the permission after it changes (a request, or the user flipping it in the browser). */
const listeners = new Set<() => void>();
const bump = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function usePushPermission(): PushPermission {
  useEffect(() => {
    if (!supported() || !navigator.permissions) return;
    let status: PermissionStatus | null = null;
    const on = () => bump();
    void navigator.permissions.query({ name: 'notifications' }).then((s) => {
      status = s;
      s.addEventListener('change', on);
    }).catch(() => undefined);
    return () => status?.removeEventListener('change', on);
  }, []);
  return useSyncExternalStore(subscribe, pushPermission, () => 'unsupported' as PushPermission);
}

/**
 * Subscribes this browser (when the engine has a VAPID key and permission is granted) and tells the
 * engine, in `locale`, which is the language its pushes are written in. Idempotent.
 */
async function registerPushDevice(locale: Locale): Promise<boolean> {
  if (pushPermission() !== 'granted' || !useAuthStore.getState().token) return false;
  try {
    const key = await vapidKey();
    if (!key) return false;
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    const json = sub.toJSON();
    if (!json.keys?.p256dh || !json.keys.auth) return false;
    const body: PushDeviceRequest = { provider: 'WEB', token: sub.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, locale, platform: 'web' };
    await api('/notifications/devices', { method: 'POST', body });
    store.set(ENDPOINT_KEY, sub.endpoint);
    return true;
  } catch (e) {
    console.warn('[push] registration failed', e); // logged once per attempt; the rest of the app does not depend on it
    return false;
  }
}

/** Sign-out, before the session is cleared: the engine forgets this browser and the subscription is dropped. */
async function unregisterPushDevice(): Promise<void> {
  const endpoint = store.get(ENDPOINT_KEY);
  store.set(ENDPOINT_KEY, null);
  if (!endpoint) return;
  try {
    const body: PushDeviceRemoveRequest = { token: endpoint };
    await api('/notifications/devices', { method: 'DELETE', body });
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* best effort: the token is dropped either way */
  }
}

/** The browser's own prompt, then registration. Resolves with the permission it ended on. */
export async function requestPush(locale: Locale): Promise<PushPermission> {
  if (!supported()) return 'unsupported';
  await Notification.requestPermission();
  bump();
  await registerPushDevice(locale);
  return pushPermission();
}

export const postponeAsk = (): void => store.set(LATER_KEY, String(Date.now()));
const postponed = (): boolean => {
  const at = Number(store.get(LATER_KEY));
  return !!at && Date.now() - at < PUSH_LATER_MS;
};

export type PushReason = 'post' | 'booking' | 'search';

interface AskState {
  reason: PushReason | null;
  /** The provider's name, for the booking copy. */
  name: string;
  show: (reason: PushReason, name?: string) => void;
  hide: () => void;
}

export const usePushAsk = create<AskState>((set) => ({
  reason: null,
  name: '',
  show: (reason, name = '') => set({ reason, name }),
  hide: () => set({ reason: null }),
}));

/**
 * Opens the rationale sheet after a listing, a booking or a saved search, but only for a signed-in
 * account whose permission is still undetermined, on a browser the engine can push to, and not within
 * a week of "later". `force` skips the week (the banner's own button).
 */
export async function askForPush(reason: PushReason, opts: { name?: string; force?: boolean } = {}): Promise<void> {
  if (!useAuthStore.getState().token || pushPermission() !== 'default') return;
  if (!opts.force && postponed()) return;
  if (!(await vapidKey())) return;
  usePushAsk.getState().show(reason, opts.name);
}

/**
 * Mounted once in the shell. Whenever the account is signed in, permission is already granted and the
 * language settles, the device is (re)registered; the language also goes to the engine for e-mail.
 */
export function usePushRegistration(): void {
  const token = useAuthStore((s) => s.token);
  const { locale } = useFormat();
  const permission = usePushPermission();
  useEffect(() => {
    if (!token) return;
    const sent = `${useAuthStore.getState().user?.id ?? ''}:${locale}`;
    if (store.get(LOCALE_SENT_KEY) === sent) return;
    store.set(LOCALE_SENT_KEY, sent);
    const body: NotificationSettingsUpdate = { locale };
    void api('/notifications/settings', { method: 'PUT', body }).catch(() => store.set(LOCALE_SENT_KEY, null));
  }, [token, locale]);
  useEffect(() => {
    if (token && permission === 'granted') void registerPushDevice(locale);
  }, [token, permission, locale]);
}

/** Signing out on the web: stop this browser's pushes, forget the browser (shared computers), drop the token. */
export function useSignOut(): () => Promise<void> {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const deviceId = useAuthStore((s) => s.deviceId);
  const clear = useAuthStore((s) => s.clear);
  return async () => {
    await unregisterPushDevice();
    try {
      await api('/auth/logout', { method: 'POST', body: { device_id: deviceId } });
    } catch {
      /* the token is dropped either way */
    }
    clear();
    qc.removeQueries({ queryKey: ['likes'] });
    toast.success(t('customer.signin.signedOut'));
  };
}
