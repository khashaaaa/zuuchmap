import { io } from 'socket.io-client';
import { API_CONFIG } from '../config/api.config';
import { getAuthToken } from './api/authHelpers';
import { logger } from '../utils/logger';

const BASE_URL = API_CONFIG.BASE_URL || 'https://zuuchmap.com/engine';
// BASE_URL already carries the /engine API prefix (nginx only proxies /engine/* to the
// backend); the socket namespace URL must be origin + /events, with /engine/socket.io
// passed separately as the `path` option — mirroring zuuchmap_web/src/lib/socket.js.
const SOCKET_ORIGIN = BASE_URL.replace(/\/engine\/?$/, '');
let socket = null;
let currentRoom = null;

// Join with an ack so a rejected join (expired JWT, wrong room) is logged
// instead of silently delivering nothing.
const joinRoom = (s, room) => {
  s.emit('join', room, (res) => {
    if (res && !res.ok) logger.warn?.(`Socket join rejected for "${room}": ${res.reason}`);
  });
};

export const socketService = {
  connect(rooms) {
    // Merge, never overwrite: the socket is a shared singleton, and one screen
    // joining 'admin' must not drop another consumer's 'provider:<id>' room
    // from the rejoin-on-reconnect list.
    const requested = Array.isArray(rooms) ? rooms : [rooms];
    currentRoom = [...new Set([...(currentRoom || []), ...requested])];
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
        currentRoom?.forEach((r) => joinRoom(socket, r));
      });
      socket.on('connect_error', (err) => {
        logger.warn?.('Socket connect error (will retry):', err?.message);
      });
      // Server rejected the handshake JWT (expired/invalid) and is dropping us.
      // It won't auto-reconnect; the next login (auth event) reconnects fresh.
      socket.on('auth_error', ({ reason } = {}) => {
        logger.warn?.('Socket auth rejected — realtime notifications paused until re-login:', reason);
      });
    }

    getAuthToken()
      .then((token) => {
        if (!socket) return;
        socket.auth = { token };
        if (!socket.connected) socket.connect();
        else currentRoom?.forEach((r) => joinRoom(socket, r));
      })
      .catch((err) => logger.error('Socket auth token error:', err));

    return socket;
  },

  on(event, handler) {
    socket?.on(event, handler);
  },

  off(event, handler) {
    socket?.off(event, handler);
  },

  disconnect() {
    currentRoom = null;
    socket?.disconnect();
    socket = null;
  },
};
