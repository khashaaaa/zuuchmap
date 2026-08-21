import { io } from 'socket.io-client'

const EVENTS_URL = import.meta.env.VITE_EVENTS_URL ?? 'https://zuuchmap.com/events'
let socket = null
let rooms = []

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
      rooms.forEach((r) => joinRoom(socket, r))
    })
    socket.on('connect_error', (err) => {
      console.warn('[socket] connect error (will retry):', err?.message)
    })
    // Server rejected the handshake JWT and dropped us; socket.io won't
    // auto-reconnect after a server-side disconnect, so log why realtime stopped.
    socket.on('auth_error', ({ reason } = {}) => {
      console.warn('[socket] auth rejected — realtime notifications paused until re-login:', reason)
    })
  }
  return socket
}

export function connectSocket(token, joinRooms = []) {
  const s = getSocket()
  s.auth = { token }
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
