import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { socketService } from '../services/socketService';
import { useAppContext } from '../context/AppContext';
import { getAuthToken, getUserInfo } from '../services/api/authHelpers';

export function useNotificationSync() {
    const { t } = useTranslation();
    const { addNotification } = useAppContext();

    useEffect(() => {
        let mounted = true;

        const setup = async () => {
            const token = await getAuthToken();
            if (!token || !mounted) return;

            const user = await getUserInfo();
            if (!user || !mounted) return;

            const isAdmin = user.is_admin === true;
            const rooms = isAdmin ? ['admin', `provider:${user.id}`] : [`provider:${user.id}`];

            const socket = socketService.connect(rooms);

            const onPostCreated = ({ title } = {}) => {
                if (!mounted) return;
                addNotification({
                    title: t('notifications.postCreated'),
                    message: title || t('notifications.postCreatedDesc'),
                    type: 'info',
                });
            };

            const onPostApproved = ({ postId, title } = {}) => {
                if (!mounted) return;
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
                addNotification({
                    title: t('notifications.postRejected'),
                    message: reason || t('notifications.postRejectedDesc'),
                    type: 'error',
                    postId,
                });
            };

            const onBookingRequested = () => {
                if (!mounted) return;
                addNotification({
                    title: t('notifications.bookingRequested'),
                    message: t('notifications.bookingRequestedDesc'),
                    type: 'info',
                });
            };

            const onBookingResponded = ({ status } = {}) => {
                if (!mounted) return;
                const accepted = status === 'ACCEPTED';
                addNotification({
                    title: accepted ? t('notifications.bookingAccepted') : t('notifications.bookingDeclined'),
                    message: accepted ? t('notifications.bookingAcceptedDesc') : t('notifications.bookingDeclinedDesc'),
                    type: accepted ? 'success' : 'error',
                });
            };

            const onBookingCancelled = () => {
                if (!mounted) return;
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

        let cleanup;
        setup().then((fn) => { cleanup = fn; });

        return () => {
            mounted = false;
            if (cleanup) cleanup();
        };
    }, [t, addNotification]);
}
