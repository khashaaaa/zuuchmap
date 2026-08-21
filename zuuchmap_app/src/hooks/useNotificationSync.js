import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { socketService } from '../services/socketService';
import { useAppContext } from '../context/AppContext';
import { getAuthToken, getUserId, getUserInfo, onAuthChanged } from '../services/api/authHelpers';
import { queryClient, invalidatePostData } from '../services/queryClient';
import { logger } from '../utils/logger';

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
            const rooms = isAdmin ? ['admin', `provider:${userId}`] : [`provider:${userId}`];

            const socket = socketService.connect(rooms);

            const onPostCreated = ({ title } = {}) => {
                if (!mounted) return;
                invalidatePostData();
                addNotification({
                    title: t('notifications.postCreated'),
                    message: title || t('notifications.postCreatedDesc'),
                    type: 'info',
                });
            };

            const onPostApproved = ({ postId, title } = {}) => {
                if (!mounted) return;
                invalidatePostData();
                addNotification({
                    title: t('notifications.postApproved'),
                    message: title
                        ? `"${title}" ${t('notifications.postApprovedDesc')}`
                        : t('notifications.postApprovedDesc'),
                    type: 'success',
                    postId,
                });
            };

            const onPostRejected = ({ postId, reason } = {}) => {
                if (!mounted) return;
                invalidatePostData();
                addNotification({
                    title: t('notifications.postRejected'),
                    message: reason || t('notifications.postRejectedDesc'),
                    type: 'error',
                    postId,
                });
            };

            const onBookingRequested = () => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                addNotification({
                    title: t('notifications.bookingRequested'),
                    message: t('notifications.bookingRequestedDesc'),
                    type: 'info',
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
                });
            };

            const onBookingCancelled = () => {
                if (!mounted) return;
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                addNotification({
                    title: t('notifications.bookingCancelled'),
                    message: t('notifications.bookingCancelledDesc'),
                    type: 'info',
                });
            };

            socket.on('post.created', onPostCreated);
            socket.on('post.approved', onPostApproved);
            socket.on('post.rejected', onPostRejected);
            socket.on('booking.requested', onBookingRequested);
            socket.on('booking.responded', onBookingResponded);
            socket.on('booking.cancelled', onBookingCancelled);

            return () => {
                socket.off('post.created', onPostCreated);
                socket.off('post.approved', onPostApproved);
                socket.off('post.rejected', onPostRejected);
                socket.off('booking.requested', onBookingRequested);
                socket.off('booking.responded', onBookingResponded);
                socket.off('booking.cancelled', onBookingCancelled);
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
