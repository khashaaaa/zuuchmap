import { useEffect } from 'react';
import { Platform } from 'react-native';
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

            // postId/postType/role and bookingRole make the rows on
            // NotificationsScreen tappable — they mirror the push-tap routing.
            const onPostCreated = ({ postId, category, title } = {}) => {
                if (!mounted) return;
                invalidatePostData();
                addNotification({
                    title: t('notifications.postCreated'),
                    message: title || t('notifications.postCreatedDesc'),
                    type: 'info',
                    postId,
                    postType: category,
                    role: 'admin',
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
            };

            const onBookingRequested = () => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                addNotification({
                    title: t('notifications.bookingRequested'),
                    message: t('notifications.bookingRequestedDesc'),
                    type: 'info',
                    bookingRole: 'provider',
                });
            };

            const onBookingResponded = ({ status } = {}) => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                const accepted = status === 'ACCEPTED';
                addNotification({
                    title: accepted ? t('notifications.bookingAccepted') : t('notifications.bookingDeclined'),
                    message: accepted ? t('notifications.bookingAcceptedDesc') : t('notifications.bookingDeclinedDesc'),
                    type: accepted ? 'success' : 'error',
                    bookingRole: 'customer',
                });
            };

            const onBookingCancelled = () => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                addNotification({
                    title: t('notifications.bookingCancelled'),
                    message: t('notifications.bookingCancelledDesc'),
                    type: 'info',
                    bookingRole: 'provider',
                });
            };

            const onStatsUpdated = () => {
                if (!mounted) return;
                invalidatePostData();
            };

            socket.on(SOCKET_EVENTS.POST_CREATED, onPostCreated);
            socket.on(SOCKET_EVENTS.POST_APPROVED, onPostApproved);
            socket.on(SOCKET_EVENTS.POST_REJECTED, onPostRejected);
            socket.on(SOCKET_EVENTS.BOOKING_REQUESTED, onBookingRequested);
            socket.on(SOCKET_EVENTS.BOOKING_RESPONDED, onBookingResponded);
            socket.on(SOCKET_EVENTS.BOOKING_CANCELLED, onBookingCancelled);
            socket.on(SOCKET_EVENTS.STATS_UPDATED, onStatsUpdated);

            return () => {
                socket.off(SOCKET_EVENTS.POST_CREATED, onPostCreated);
                socket.off(SOCKET_EVENTS.POST_APPROVED, onPostApproved);
                socket.off(SOCKET_EVENTS.POST_REJECTED, onPostRejected);
                socket.off(SOCKET_EVENTS.BOOKING_REQUESTED, onBookingRequested);
                socket.off(SOCKET_EVENTS.BOOKING_RESPONDED, onBookingResponded);
                socket.off(SOCKET_EVENTS.BOOKING_CANCELLED, onBookingCancelled);
                socket.off(SOCKET_EVENTS.STATS_UPDATED, onStatsUpdated);
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
