import { create } from 'zustand'
import { getToken, getUser, setAuth as persistAuth, clearAuth as persistClear, isTokenExpired } from './lib/auth'
import { usersApi } from './lib/api'
import { queryClient } from './lib/queryClient'

export const useThemeStore = create((set) => ({
  theme: document.documentElement.getAttribute('data-theme') || 'dark',
  toggleTheme: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('zm_theme', next)
    document.documentElement.setAttribute('data-theme', next)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#FAFAF8' : '#17181A')
    return { theme: next }
  }),
}))

const NOTIFICATION_LIMIT = 30
const NOTIFICATION_KEY = 'zm_notifications'

// Notifications lived in memory only, so a refresh erased them: an approval
// arrived, the user reloaded, and the bell said there had never been anything.
const readStoredNotifications = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, NOTIFICATION_LIMIT) : []
  } catch { return [] }
}

const writeStoredNotifications = (notifications) => {
  try { localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notifications)) } catch { /* private mode */ }
}

const initialNotifications = readStoredNotifications()

// Date.now() alone collides when two events land in the same millisecond, and
// duplicate keys make React reuse the wrong row.
let notificationSeq = 0

export const useNotificationStore = create((set) => ({
  notifications: initialNotifications,
  unreadCount: initialNotifications.filter((n) => !n.read).length,
  add: (notification) => set((s) => {
    const notifications = [
      { ...notification, id: `${Date.now()}-${++notificationSeq}`, ts: new Date().toISOString(), read: false },
      ...s.notifications,
    ].slice(0, NOTIFICATION_LIMIT)
    writeStoredNotifications(notifications)
    return { notifications, unreadCount: s.unreadCount + 1 }
  }),
  markAllRead: () => set((s) => {
    const notifications = s.notifications.map((n) => ({ ...n, read: true }))
    writeStoredNotifications(notifications)
    return { notifications, unreadCount: 0 }
  }),
  clear: () => {
    writeStoredNotifications([])
    return set({ notifications: [], unreadCount: 0 })
  },
}))

export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  isAdmin: false,
  isLoading: true,

  // The login/JWT user carries only id/phone/type/is_admin. Merge the full
  // profile so given_name, email, etc. are available (greetings, sidebar) —
  // both on cold hydrate and immediately after login, without a refresh.
  refreshProfile: async (token, user) => {
    try {
      const profile = await usersApi.getProfile()
      const merged = { ...user, ...profile, is_admin: profile.is_admin === true }
      persistAuth(token, merged)
      set({ user: merged, isAdmin: profile.is_admin === true })
    } catch {} // silent — server unreachable or token expired (401 handler redirects)
  },

  // Committing an expired token painted the whole signed-in shell, which the
  // 401 handler then tore away — the user watched their dashboard flash past on
  // the way to the login screen. `exp` is readable from the token itself, so a
  // dead session is recognised before anything renders, and a live one still
  // paints immediately without waiting on the network.
  hydrate: async () => {
    const token = getToken()
    const user = getUser()
    if (!token || !user) { set({ isLoading: false }); return }
    if (isTokenExpired(token)) { persistClear(); set({ isLoading: false }); return }
    set({ token, user, isAdmin: user.is_admin === true, isLoading: false })
    await useAuthStore.getState().refreshProfile(token, user)
  },

  // Profile edits update the session user without queryClient.clear() —
  // wiping every cached query on a name change caused a full refetch cascade.
  setUser: (user) => {
    const token = useAuthStore.getState().token
    persistAuth(token, user)
    set({ user, isAdmin: user.is_admin === true })
  },

  login: (token, user) => {
    queryClient.clear()
    persistAuth(token, user)
    set({ token, user, isAdmin: user.is_admin === true, isLoading: false })
    useAuthStore.getState().refreshProfile(token, user)
  },

  logout: () => {
    persistClear()
    set({ token: null, user: null, isAdmin: false })
    queryClient.clear()
  },
}))
