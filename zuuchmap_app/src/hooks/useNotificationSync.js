import { useEffect } from 'react';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { socketService, SOCKET_EVENTS, ROOM_ADMIN, userRoom } from '../services/socketService';
import { useAppContext } from '../context/AppContext';
import { getAuthToken, getUserId, getUserInfo, onAuthChanged } from '../services/api/authHelpers';
import { queryClient, invalidatePostData } from '../services/queryClient';
import apiClient from '../services/api/apiClient';
import { API_CONFIG } from '../config/api.config';
import { logger } from '../utils/logger';
import { navigationRef } from '../utils/navigationUtils';
import { CONVERSATIONS_KEY, UNREAD_KEY, messagesKey } from '../services/api/messageService';

export const SOUND_PREF_KEY = 'zm_sound';
const LOCAL_SOUND = 'notify.wav';
const DEDUPE_MS = 5000;

// `${type}:${id}` of banners presented in the last few seconds. The server
// sends the same event over the socket AND as a push; whichever lands second
// must not raise a second banner.
const recentBanners = new Map();
export function markSeen(key, now = Date.now()) {
    for (const [k, ts] of recentBanners) if (now - ts > DEDUPE_MS) recentBanners.delete(k);
    if (recentBanners.has(key)) return false;
    recentBanners.set(key, now);
    return true;
}

export async function isSoundEnabled() {
    try {
        const v = await AsyncStorage.getItem(SOUND_PREF_KEY);
        return v !== '0';
    } catch { return true; }
}

// Is the user already looking at the screen this event belongs to? A banner
// over the very thread a message just landed in is noise, not news.
function isViewing(screen, params) {
    if (!navigationRef.isReady?.()) return false;
    const route = navigationRef.getCurrentRoute?.();
    if (!route || route.name !== screen) return false;
    if (!params) return true;
    return Object.entries(params).every(([k, v]) => String(route.params?.[k]) === String(v));
}

/**
 * Foreground banner + chime for a socket event. `data` must be the shape the
 * server push carries (`type`/`notifType` + ids) — the tap is handled by the
 * same `handleNotificationResponse` in App.js as a real push.
 */
async function presentLocal({ key, title, body, data, viewing }) {
    if (AppState.currentState !== 'active') return;
    if (!markSeen(key)) return;
    if (viewing && isViewing(viewing.screen, viewing.params)) return;
    try {
        const sound = await isSoundEnabled();
        await Notifications.scheduleNotificationAsync({
            content: { title, body, data, sound: sound ? LOCAL_SOUND : false },
            trigger: null,
        });
    } catch (err) {
        // Expo Go / no permission — the in-app bell row still exists.
        logger.warn?.('Local notification failed:', err?.message);
    }
}

const EAS_PROJECT_ID = '40d1a5b1-f537-4097-88f7-ffad9545f7d0';

// Register this device's Expo push token for the logged-in account. Runs on
// every auth event (cold start with a stored session AND fresh login), so a
// user who just verified gets pushes without restarting the app. Idempotent
// server-side; each account switch re-binds the token to the new account.
async function registerPushToken() {
    if (!Device.isDevice) return;
    try {
        if (Platform.OS === 'android') {
            // Android 8+ drops notifications without a channel; Expo's push
            // service targets 'default' when the message names none.
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                // Bundled via the expo-notifications plugin `sounds` array;
                // present only from the next EAS build, default sound until then.
                sound: LOCAL_SOUND,
            });
        }
        const { status: existing } = await Notifications.getPermissionsAsync();
        let status = existing;
        if (existing !== 'granted') {
            ({ status } = await Notifications.requestPermissionsAsync());
        }
        if (status !== 'granted') return;
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
        if (!token) return;
        await apiClient.put(API_CONFIG.ENDPOINTS.USER.SAVE_PUSH_TOKEN, {
            push_token: token,
            platform: Platform.OS,
        });
        // Kept so logout can unbind *this* device rather than the whole account.
        await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.PUSH_TOKEN, token).catch(() => {});
    } catch (err) {
        // Expo Go / simulator / denied permission — push simply stays off.
        logger.warn?.('Push token registration failed:', err?.message);
    }
}

export function useNotificationSync() {
    const { t } = useTranslation();
    const { addNotification, clearNotifications } = useAppContext();

    useEffect(() => {
        let mounted = true;
        let teardown = null;

        const setup = async () => {
            const token = await getAuthToken();
            if (!token || !mounted) return null;

            const user = await getUserInfo();
            // USER_INFO doesn't always carry the id (login stores it separately).
            const userId = user?.id || (await getUserId());
            if (!userId || !mounted) return null;

            const isAdmin = user?.is_admin === true;
            const rooms = isAdmin ? [ROOM_ADMIN, userRoom(userId)] : [userRoom(userId)];

            registerPushToken();

            const socket = socketService.connect(rooms);

            // A message sent while the socket was down never arrives as an
            // event. Refetch the messaging reads on every *re*connect (the
            // first connect is skipped — screens fetch on mount) so the gap
            // closes when the network returns, not on the next foreground.
            let connectedOnce = socket.connected;
            const onReconnect = () => {
                if (!mounted) return;
                if (!connectedOnce) { connectedOnce = true; return; }
                queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
                queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
                queryClient.invalidateQueries({ queryKey: ['conversation'] });
            };

            // postId/postType/role and bookingRole make the rows on
            // NotificationsScreen tappable — they mirror the push-tap routing.
            const onPostCreated = ({ postId, category, title } = {}) => {
                if (!mounted) return;
                invalidatePostData();
                // Only admins receive this — it is a new row in their queue.
                queryClient.invalidateQueries({ queryKey: ['admin'] });
                addNotification({
                    title: t('notifications.postCreated'),
                    message: title || t('notifications.postCreatedDesc'),
                    type: 'info',
                    postId,
                    postType: category,
                    role: 'admin',
                });
                presentLocal({
                    key: `post.created:${postId}`,
                    title: t('notifications.postCreated'),
                    body: title || t('notifications.postCreatedDesc'),
                    data: { postId, post_type: category, notifType: 'new_post' },
                    viewing: { screen: 'PostDetailScreen', params: { postId } },
                });
            };

            const onPostApproved = ({ postId, title, category } = {}) => {
                if (!mounted) return;
                invalidatePostData();
                addNotification({
                    title: t('notifications.postApproved'),
                    message: title
                        ? `"${title}" ${t('notifications.postApprovedDesc')}`
                        : t('notifications.postApprovedDesc'),
                    type: 'success',
                    postId,
                    postType: category,
                    role: 'provider',
                });
                presentLocal({
                    key: `post.approved:${postId}`,
                    title: t('notifications.postApproved'),
                    body: title || t('notifications.postApprovedDesc'),
                    data: { postId, post_type: category, notifType: 'approved' },
                });
            };

            const onPostRejected = ({ postId, reason, category } = {}) => {
                if (!mounted) return;
                invalidatePostData();
                addNotification({
                    title: t('notifications.postRejected'),
                    message: reason || t('notifications.postRejectedDesc'),
                    type: 'error',
                    postId,
                    postType: category,
                    role: 'provider',
                });
                presentLocal({
                    key: `post.rejected:${postId}`,
                    title: t('notifications.postRejected'),
                    body: reason || t('notifications.postRejectedDesc'),
                    data: { postId, post_type: category, notifType: 'rejected' },
                });
            };

            const onBookingRequested = ({ bookingId } = {}) => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                addNotification({
                    title: t('notifications.bookingRequested'),
                    message: t('notifications.bookingRequestedDesc'),
                    type: 'info',
                    bookingRole: 'provider',
                });
                presentLocal({
                    key: `booking.requested:${bookingId}`,
                    title: t('notifications.bookingRequested'),
                    body: t('notifications.bookingRequestedDesc'),
                    data: { bookingId, notifType: SOCKET_EVENTS.BOOKING_REQUESTED },
                    viewing: { screen: 'BookingList', params: { role: 'provider' } },
                });
            };

            const onBookingResponded = ({ status, bookingId } = {}) => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                const accepted = status === 'ACCEPTED';
                const title = accepted ? t('notifications.bookingAccepted') : t('notifications.bookingDeclined');
                const body = accepted ? t('notifications.bookingAcceptedDesc') : t('notifications.bookingDeclinedDesc');
                addNotification({
                    title,
                    message: body,
                    type: accepted ? 'success' : 'error',
                    bookingRole: 'customer',
                });
                presentLocal({
                    key: `booking.responded:${bookingId}:${status}`,
                    title,
                    body,
                    data: { bookingId, notifType: SOCKET_EVENTS.BOOKING_RESPONDED },
                    viewing: { screen: 'BookingList', params: { role: 'customer' } },
                });
            };

            const onBookingCancelled = ({ bookingId } = {}) => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                addNotification({
                    title: t('notifications.bookingCancelled'),
                    message: t('notifications.bookingCancelledDesc'),
                    type: 'info',
                    bookingRole: 'provider',
                });
                presentLocal({
                    key: `booking.cancelled:${bookingId}`,
                    title: t('notifications.bookingCancelled'),
                    body: t('notifications.bookingCancelledDesc'),
                    data: { bookingId, notifType: SOCKET_EVENTS.BOOKING_CANCELLED },
                    viewing: { screen: 'BookingList', params: { role: 'provider' } },
                });
            };

            // Recipient-only on the server, so no "is this mine" check here.
            const onMessageCreated = ({ conversationId, messageId, postId, preview } = {}) => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
                queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
                if (conversationId) queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
                addNotification({
                    title: t('notifications.newMessage'),
                    message: preview || '',
                    type: 'info',
                    conversationId,
                    postId,
                });
                presentLocal({
                    key: `message:${messageId ?? conversationId}`,
                    title: t('notifications.newMessage'),
                    body: preview || '',
                    data: { type: 'message', conversationId, postId: postId ?? null },
                    viewing: { screen: 'MessageThread', params: { id: conversationId } },
                });
            };

            const onReportCreated = ({ reportId, postId } = {}) => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['reports'] });
                addNotification({
                    title: t('notifications.reportCreated'),
                    message: t('notifications.reportCreatedDesc'),
                    type: 'error',
                    postId,
                    role: 'admin',
                    reportId,
                });
                presentLocal({
                    key: `report.created:${reportId ?? postId}`,
                    title: t('notifications.reportCreated'),
                    body: t('notifications.reportCreatedDesc'),
                    data: { postId, notifType: 'report' },
                });
            };

            const onStatsUpdated = () => {
                if (!mounted) return;
                invalidatePostData();
            };

            socket.on('connect', onReconnect);
            socket.on(SOCKET_EVENTS.POST_CREATED, onPostCreated);
            socket.on(SOCKET_EVENTS.POST_APPROVED, onPostApproved);
            socket.on(SOCKET_EVENTS.POST_REJECTED, onPostRejected);
            socket.on(SOCKET_EVENTS.BOOKING_REQUESTED, onBookingRequested);
            socket.on(SOCKET_EVENTS.BOOKING_RESPONDED, onBookingResponded);
            socket.on(SOCKET_EVENTS.BOOKING_CANCELLED, onBookingCancelled);
            socket.on(SOCKET_EVENTS.STATS_UPDATED, onStatsUpdated);
            socket.on(SOCKET_EVENTS.MESSAGE_CREATED, onMessageCreated);
            if (isAdmin) socket.on(SOCKET_EVENTS.REPORT_CREATED, onReportCreated);

            return () => {
                socket.off('connect', onReconnect);
                socket.off(SOCKET_EVENTS.POST_CREATED, onPostCreated);
                socket.off(SOCKET_EVENTS.POST_APPROVED, onPostApproved);
                socket.off(SOCKET_EVENTS.POST_REJECTED, onPostRejected);
                socket.off(SOCKET_EVENTS.BOOKING_REQUESTED, onBookingRequested);
                socket.off(SOCKET_EVENTS.BOOKING_RESPONDED, onBookingResponded);
                socket.off(SOCKET_EVENTS.BOOKING_CANCELLED, onBookingCancelled);
                socket.off(SOCKET_EVENTS.STATS_UPDATED, onStatsUpdated);
                socket.off(SOCKET_EVENTS.MESSAGE_CREATED, onMessageCreated);
                socket.off(SOCKET_EVENTS.REPORT_CREATED, onReportCreated);
            };
        };

        // Serialize setup/teardown so a login racing an unmount (or a second
        // auth event) can never leak handlers on the shared socket.
        let chain = Promise.resolve();
        const restart = () => {
            chain = chain.then(async () => {
                if (teardown) { teardown(); teardown = null; }
                const fn = await setup();
                if (fn && !mounted) { fn(); return; }
                teardown = fn;
            }).catch((err) => {
                // A failed setup must not poison the chain — the next auth
                // event has to be able to retry.
                logger.error('Notification sync setup failed:', err);
            });
        };

        restart();

        // Login connects the socket for the new account; logout (socket already
        // disconnected by userService) drops handlers and the old account's bell.
        const unsubscribe = onAuthChanged(async () => {
            const token = await getAuthToken();
            if (!mounted) return;
            if (!token) {
                chain = chain.then(() => {
                    if (teardown) { teardown(); teardown = null; }
                });
                clearNotifications();
                return;
            }
            restart();
        });

        return () => {
            mounted = false;
            unsubscribe();
            chain.then(() => { if (teardown) teardown(); });
        };
    }, [t, addNotification, clearNotifications]);
}
