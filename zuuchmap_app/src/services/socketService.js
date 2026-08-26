import { io } from 'socket.io-client';
import { API_CONFIG } from '../config/api.config';
import { getAuthToken } from './api/authHelpers';
import { logger } from '../utils/logger';

const BASE_URL = API_CONFIG.BASE_URL || 'https://zuuchmap.com/engine';
// BASE_URL already carries the /engine API prefix (nginx only proxies /engine/* to the
// backend); the socket namespace URL must be origin + /events, with /engine/socket.io
// passed separately as the `path` option — mirroring zuuchmap_web/src/lib/socket.js.
const SOCKET_ORIGIN = BASE_URL.replace(/\/engine\/?$/, '');

// Socket event contract — mirrors zuuchmap_engine/src/events/events.gateway.ts
// (and zuuchmap_web/src/lib/socket.js); change all three together.
// Per-user payloads use { postId, category, title } — never `id`/`post_type`.
export const SOCKET_EVENTS = {
    POST_CREATED: 'post.created',
    POST_APPROVED: 'post.approved',
    POST_REJECTED: 'post.rejected',
    STATS_UPDATED: 'stats.updated',
    BOOKING_REQUESTED: 'booking.requested',
    BOOKING_RESPONDED: 'booking.responded',
    BOOKING_CANCELLED: 'booking.cancelled',
    MESSAGE_CREATED: 'message.created',
    REPORT_CREATED: 'report.created',
    AUTH_ERROR: 'auth_error',
};

export const ROOM_ADMIN = 'admin';
export const userRoom = (userId) => `user:${userId}`;

let socket = null;
let rooms = null;
let authRetried = false;

// Join with an ack so a rejected join (expired JWT, wrong room) is logged
// instead of silently delivering nothing.
const joinRoom = (s, room) => {
    s.emit('join', room, (res) => {
        if (res && !res.ok) logger.warn?.(`Socket join rejected for "${room}": ${res.reason}`);
    });
};

// Single-consumer singleton: useNotificationSync owns the socket's whole
// lifecycle (connect on auth, disconnect via userService.logout). Screens must
// not subscribe directly — new events belong in useNotificationSync.
export const socketService = {
    connect(requestedRooms) {
        rooms = Array.isArray(requestedRooms) ? requestedRooms : [requestedRooms];
        if (!socket) {
            socket = io(`${SOCKET_ORIGIN}/events`, {
                path: '/engine/socket.io',
                transports: ['websocket'],
                autoConnect: false,
                reconnection: true,
                reconnectionDelay: 2000,
                reconnectionDelayMax: 30000,
            });
            // Re-join every room after each (re)connect — otherwise a dropped connection
            // silently stops delivering room events even though the socket reconnects.
            socket.on('connect', () => {
                authRetried = false;
                rooms?.forEach((r) => joinRoom(socket, r));
            });
            socket.on('connect_error', (err) => {
                logger.warn?.('Socket connect error (will retry):', err?.message);
            });
            // Server rejected the handshake JWT and dropped us (no auto-reconnect
            // after a server-side disconnect). The socket may be holding a stale
            // token, so retry ONCE with the currently stored one; if that is what
            // just failed, realtime stays paused — the next auth event reconnects.
            socket.on(SOCKET_EVENTS.AUTH_ERROR, ({ reason } = {}) => {
                if (!authRetried) {
                    authRetried = true;
                    getAuthToken()
                        .then((token) => {
                            if (!socket || !token) return;
                            socket.auth = { token };
                            socket.connect();
                        })
                        .catch(() => {});
                    return;
                }
                logger.warn?.('Socket auth rejected — realtime notifications paused until re-login:', reason);
            });
        }

        getAuthToken()
            .then((token) => {
                if (!socket) return;
                socket.auth = { token };
                authRetried = false;
                if (!socket.connected) socket.connect();
                else rooms?.forEach((r) => joinRoom(socket, r));
            })
            .catch((err) => logger.error('Socket auth token error:', err));

        return socket;
    },

    isConnected() {
        return socket?.connected === true;
    },

    on(event, handler) {
        socket?.on(event, handler);
    },

    off(event, handler) {
        socket?.off(event, handler);
    },

    disconnect() {
        rooms = null;
        socket?.disconnect();
        // Drop every handler before abandoning the instance — socket.io-client
        // caches the first Manager for the process lifetime, so listeners left
        // attached (and every closure they hold) would be retained forever.
        socket?.removeAllListeners();
        socket = null;
    },
};
