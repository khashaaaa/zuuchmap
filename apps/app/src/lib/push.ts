import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { notificationCopy, type Locale, type NotificationData, type NotificationKind, type PushDeviceRequest } from '@zuuchmap/core';
import appJson from '../../app.json';
import i18n from '../i18n';
import { api } from './api';
import { getAuth, useAuth } from './auth';

// Push on the phone: permission (asked inline, never at sign-in), the Expo token, the engine's device row,
// and the foreground path (a socket event becomes a system notification while the app is open).

const LATER_KEY = 'zm_push_later';
const LATER_MS = 7 * 24 * 60 * 60 * 1000;
const PROJECT_ID = (appJson.expo as { extra?: { eas?: { projectId?: string } } }).extra?.eas?.projectId;

export type PermissionState = 'unknown' | 'undetermined' | 'granted' | 'denied';

let permission: PermissionState = 'unknown';
const listeners = new Set<() => void>();
const setPermission = (next: PermissionState) => {
  if (next === permission) return;
  permission = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const usePermission = (): PermissionState => useSyncExternalStore(subscribe, () => permission, () => permission);

/** The current OS permission, also stored for `usePermission`. */
export async function refreshPermission(): Promise<PermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    // Android 13+ reports `denied` before the first ask; it is a refusal only once the system will not ask again.
    setPermission(p.granted ? 'granted' : p.status === 'denied' && !p.canAskAgain ? 'denied' : 'undetermined');
  } catch {
    setPermission('undetermined');
  }
  return permission;
}

let channelReady = false;
async function ensureChannel(): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;
  channelReady = true;
  // Android O+ takes sound and vibration from the channel, and a channel is immutable once
  // created: changing any of this needs a new channel id (and the engine's `channelId`).
  await Notifications.setNotificationChannelAsync('default', {
    name: i18n.t('notif.title'),
    importance: Notifications.AndroidImportance.MAX,
    sound: 'notify.wav', // bundled by the expo-notifications plugin (app.json `sounds`)
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lightColor: '#FF6A1F',
  }).catch(() => undefined);
}

/**
 * The notifications we schedule ourselves (a socket event while the app is open) show and sound
 * like a push; a remote push that reaches a foreground app is already on screen via the socket,
 * so it stays silent and hidden. `shouldPlaySound: false` would silence the channel too.
 */
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const remote = (n.request.trigger as { type?: string } | null)?.type === 'push';
    return { shouldShowBanner: !remote, shouldShowList: !remote, shouldPlaySound: !remote, shouldSetBadge: false };
  },
});

// ---- Device registration ----

let token: string | null = null;
let sentKey: string | null = null;
let warned = false;
const warnOnce = (e: unknown) => {
  if (warned) return;
  warned = true;
  // Expo Go on Android (SDK 53+) and builds without Firebase cannot get a push token; the foreground path still works.
  console.log('[push] no Expo push token:', e instanceof Error ? e.message : String(e));
};

async function expoToken(): Promise<string | null> {
  if (token) return token;
  try {
    if (!Device.isDevice) throw new Error('not a physical device');
    const res = await Notifications.getExpoPushTokenAsync(PROJECT_ID ? { projectId: PROJECT_ID } : undefined);
    token = res.data;
    return token;
  } catch (e) {
    warnOnce(e);
    return null;
  }
}

/** POST the device whenever signed in and the permission is already granted. Idempotent per (user, token, language). */
export async function registerDevice(): Promise<void> {
  const { token: jwt, user } = getAuth();
  if (!jwt || !user) return;
  if ((await refreshPermission()) !== 'granted') return;
  await ensureChannel();
  const t = await expoToken();
  if (!t) return;
  const locale = i18n.language as Locale;
  const key = `${user.id}|${t}|${locale}`;
  if (key === sentKey) return;
  const body: PushDeviceRequest = { provider: 'EXPO', token: t, locale, platform: Platform.OS };
  try {
    await api('/notifications/devices', { method: 'POST', body });
    sentKey = key;
  } catch {
    /* retried on the next start, sign-in or foreground */
  }
}

/** Sign-out: tell the engine to stop pushing to this phone. Call before the session is cleared. */
export async function unregisterDevice(): Promise<void> {
  const t = token;
  sentKey = null;
  if (!t || !getAuth().token) return;
  await api('/notifications/devices', { method: 'DELETE', body: { token: t } }).catch(() => undefined);
}

/** The language changed: the e-mail language and the device's push language follow. */
export async function syncLocale(locale: Locale): Promise<void> {
  if (!getAuth().token) return;
  await api('/notifications/settings', { method: 'PUT', body: { locale } }).catch(() => undefined);
  await registerDevice();
}

/** Mounted once: registers on start, sign-in and return to the foreground (the user may have granted it in Settings). */
export function usePushSync(): void {
  const { token: jwt, user } = useAuth();
  const uid = user?.id;
  useEffect(() => {
    void refreshPermission();
    if (jwt && uid) void registerDevice();
  }, [jwt, uid]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void registerDevice().then(refreshPermission);
    });
    return () => sub.remove();
  }, []);
}

// ---- Asking ----

async function snoozed(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(LATER_KEY);
    return !!v && Date.now() - Number(v) < LATER_MS;
  } catch {
    return false;
  }
}

export async function requestPermission(): Promise<PermissionState> {
  await ensureChannel();
  try {
    const p = await Notifications.requestPermissionsAsync();
    setPermission(p.granted ? 'granted' : 'denied');
  } catch {
    await refreshPermission();
  }
  if (permission === 'granted') void registerDevice();
  return permission;
}

export const openSystemSettings = (): void => void Linking.openSettings().catch(() => undefined);

/**
 * The inline ask: shown only while the OS permission is undetermined and the user has not said "later" in the last 7 days.
 * `enable` raises the system dialog; `later` snoozes for a week.
 */
export function usePushAsk(): { show: boolean; enable: () => void; later: () => void } {
  const { token: jwt } = useAuth();
  const perm = usePermission();
  const [asleep, setAsleep] = useState(true);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    void snoozed().then((s) => setAsleep(s));
    void refreshPermission();
  }, []);
  const enable = useCallback(() => {
    setGone(true);
    void requestPermission();
  }, []);
  const later = useCallback(() => {
    setGone(true);
    AsyncStorage.setItem(LATER_KEY, String(Date.now())).catch(() => undefined);
  }, []);
  return { show: !!jwt && perm === 'undetermined' && !asleep && !gone, enable, later };
}

/** For the host sheet: can we ask right now? */
export async function canAskNow(): Promise<boolean> {
  if (!getAuth().token) return false;
  return (await refreshPermission()) === 'undetermined' && !(await snoozed());
}

export const snoozePrompt = (): void => void AsyncStorage.setItem(LATER_KEY, String(Date.now())).catch(() => undefined);

// ---- Foreground delivery ----

/** What a tap carries; `data` mirrors the engine's `PushPayload`. */
export interface TapPayload { notification_id: string | null; kind: NotificationKind; data: NotificationData }

/** A system notification for an event that arrived over the socket while the app is open (or lingering in the background). */
export async function presentLocal(n: { id: string; kind: NotificationKind; data: NotificationData }): Promise<void> {
  if (permission !== 'granted' && (await refreshPermission()) !== 'granted') return;
  const { title, body } = notificationCopy(n, (k, o) => i18n.t(k, o) as string);
  await ensureChannel();
  const payload: TapPayload = { notification_id: n.kind === 'MESSAGE_CREATED' ? null : n.id, kind: n.kind, data: n.data };
  await Notifications.scheduleNotificationAsync({
    identifier: n.id,
    content: { title, body, data: payload as unknown as Record<string, unknown> },
    trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
  }).catch(() => undefined);
}
