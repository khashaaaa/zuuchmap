import { io } from 'socket.io-client'

const EVENTS_URL = import.meta.env.VITE_EVENTS_URL ?? 'https://zuuchmap.com/events'
let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(EVENTS_URL, {
      path: '/engine/socket.io',
      transports: ['websocket'],
      autoConnect: false,
    })
  }
  return socket
}

export function connectSocket(token) {
  const s = getSocket()
  s.auth = { token }
  if (!s.connected) s.connect()
  return s
}

// Soft disconnect — keeps the singleton alive so the next connectSocket() can reconnect.
// Safe to call in effect cleanup and StrictMode double-invoke.
export function disconnectSocket() {
  if (socket?.connected) socket.disconnect()
}

// Hard destroy — nulls the singleton. Call only on logout.
export function destroySocket() {
  if (socket) { socket.disconnect(); socket = null }
}
