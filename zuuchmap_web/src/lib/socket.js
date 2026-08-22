import { io } from 'socket.io-client'
import { getToken } from './auth'

const EVENTS_URL = import.meta.env.VITE_EVENTS_URL ?? 'https://zuuchmap.com/events'

// Socket event contract — mirrors zuuchmap_engine/src/events/events.gateway.ts
// (and zuuchmap_app/src/services/socketService.js); change all three together.
// Per-user payloads use { postId, category, title } — never `id`/`post_type`.
export const SOCKET_EVENTS = {
  POST_CREATED: 'post.created',
  POST_APPROVED: 'post.approved',
  POST_REJECTED: 'post.rejected',
  STATS_UPDATED: 'stats.updated',
  BOOKING_REQUESTED: 'booking.requested',
  BOOKING_RESPONDED: 'booking.responded',
  BOOKING_CANCELLED: 'booking.cancelled',
  AUTH_ERROR: 'auth_error',
}

export const ROOM_ADMIN = 'admin'
export const userRoom = (userId) => `user:${userId}`

let socket = null
let rooms = []
let authRetried = false

// Join with an ack so a rejected join (expired JWT, wrong room) is logged
// instead of silently delivering nothing.
function joinRoom(s, room) {
  s.emit('join', room, (res) => {
    if (res && !res.ok) console.warn(`[socket] join rejected for "${room}": ${res.reason}`)
  })
}

function getSocket() {
  if (!socket) {
    socket = io(EVENTS_URL, {
      path: '/engine/socket.io',
      transports: ['websocket'],
      autoConnect: false,
    })
    // Re-join every room after each (re)connect — server-side room membership
    // dies with the connection, so without this a network blip silently stops
    // all notifications until the page is reloaded.
    socket.on('connect', () => {
      authRetried = false
      rooms.forEach((r) => joinRoom(socket, r))
    })
    socket.on('connect_error', (err) => {
      console.warn('[socket] connect error (will retry):', err?.message)
    })
    // Server rejected the handshake JWT and dropped us (socket.io won't
    // auto-reconnect after a server-side disconnect). The socket may be holding
    // a stale token, so retry ONCE with the currently stored one; if that is
    // what just failed, realtime stays paused — the next login reconnects.
    socket.on(SOCKET_EVENTS.AUTH_ERROR, ({ reason } = {}) => {
      const stored = getToken()
      if (stored && !authRetried) {
        authRetried = true
        socket.auth = { token: stored }
        socket.connect()
        return
      }
      console.warn('[socket] auth rejected — realtime notifications paused until re-login:', reason)
    })
  }
  return socket
}

export function connectSocket(token, joinRooms = []) {
  const s = getSocket()
  s.auth = { token }
  authRetried = false
  rooms = joinRooms
  if (!s.connected) s.connect()
  else joinRooms.forEach((r) => joinRoom(s, r))
  return s
}

// Soft disconnect — keeps the singleton alive so the next connectSocket() can reconnect.
// Safe to call in effect cleanup and StrictMode double-invoke.
export function disconnectSocket() {
  if (socket?.connected) socket.disconnect()
}

// Hard destroy — nulls the singleton. Call only on logout.
export function destroySocket() {
  rooms = []
  if (socket) { socket.disconnect(); socket = null }
}
