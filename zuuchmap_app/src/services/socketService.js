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

export const socketService = {
  connect(rooms) {
    currentRoom = Array.isArray(rooms) ? rooms : [rooms];
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
        currentRoom?.forEach((r) => socket.emit('join', r));
      });
      socket.on('connect_error', (err) => {
        logger.warn?.('Socket connect error (will retry):', err?.message);
      });
    }

    getAuthToken()
      .then((token) => {
        if (!socket) return;
        socket.auth = { token };
        if (!socket.connected) socket.connect();
        else currentRoom?.forEach((r) => socket.emit('join', r));
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
