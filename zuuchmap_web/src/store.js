import { create } from 'zustand'
import { getToken, getUser, setAuth as persistAuth, clearAuth as persistClear, isTokenExpired } from './lib/auth'
import { queryClient } from './lib/queryClient'
import { clearAllDrafts } from './lib/draftStorage'

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
const NOTIFICATION_OWNER_KEY = 'zm_notifications_user'

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

// These carry post titles and booking messages, so they belong to one account.
// Sign-out clears them, but a second account signing in on the same browser
// without one — the store is only cleared when the token goes away — inherited
// whatever the previous user had. The owner is stamped alongside and checked on
// every sign-in instead of trusting that a sign-out happened.
const unreadOf = (notifications) => notifications.filter((n) => !n.read).length

// Date.now() alone collides when two events land in the same millisecond, and
// duplicate keys make React reuse the wrong row.
let notificationSeq = 0

export const useNotificationStore = create((set) => ({
  notifications: initialNotifications,
  unreadCount: unreadOf(initialNotifications),
  add: (notification) => set((s) => {
    const notifications = [
      { ...notification, id: `${Date.now()}-${++notificationSeq}`, ts: new Date().toISOString(), read: false },
      ...s.notifications,
    ].slice(0, NOTIFICATION_LIMIT)
    writeStoredNotifications(notifications)
    // Derived, never incremented: the list is capped at NOTIFICATION_LIMIT, so
    // a running counter kept counting unread entries the slice had already
    // dropped and the bell showed a number the dropdown could not account for.
    return { notifications, unreadCount: unreadOf(notifications) }
  }),
  markRead: (id) => set((s) => {
    if (!s.notifications.some((n) => n.id === id && !n.read)) return {}
    const notifications = s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    writeStoredNotifications(notifications)
    return { notifications, unreadCount: unreadOf(notifications) }
  }),
  markAllRead: () => set((s) => {
    const notifications = s.notifications.map((n) => ({ ...n, read: true }))
    writeStoredNotifications(notifications)
    return { notifications, unreadCount: 0 }
  }),
  clear: () => {
    writeStoredNotifications([])
    try { localStorage.removeItem(NOTIFICATION_OWNER_KEY) } catch { /* private mode */ }
    return set({ notifications: [], unreadCount: 0 })
  },
  /**
   * Binds the stored notifications to one account. Called once the signed-in
   * user is known; a different owner than the one on disk means these are
   * someone else's and get dropped rather than shown to the new user.
   */
  scopeTo: (userId) => {
    if (!userId) return
    let owner = null
    try { owner = localStorage.getItem(NOTIFICATION_OWNER_KEY) } catch { /* private mode */ }
    if (owner === String(userId)) return
    try { localStorage.setItem(NOTIFICATION_OWNER_KEY, String(userId)) } catch { /* private mode */ }
    // No stored owner at all: pre-existing entries predate this stamp and
    // cannot be attributed, so they go too rather than be shown to the wrong person.
    writeStoredNotifications([])
    set({ notifications: [], unreadCount: 0 })
  },
}))

/** The fields the login response hands back — enough to route before the profile loads. */
const identityOf = (user) => user ? {
  id: user.id,
  phone_number: user.phone_number,
  type: user.type ?? null,
  is_admin: user.is_admin === true,
} : null

export const useAuthStore = create((set, get) => ({
  token: null,
  // Identity only (id / phone / type / is_admin). The full profile lives in
  // React Query under ['profile'] — see hooks/useProfile.js.
  user: null,
  isAdmin: false,
  isLoading: true,

  // Committing an expired token painted the whole signed-in shell, which the
  // 401 handler then tore away — the user watched their dashboard flash past on
  // the way to the login screen. `exp` is readable from the token itself, so a
  // dead session is recognised before anything renders, and a live one still
  // paints immediately without waiting on the network.
  hydrate: () => {
    const token = getToken()
    const user = identityOf(getUser())
    if (!token || !user) { set({ isLoading: false }); return }
    if (isTokenExpired(token)) { persistClear(); set({ isLoading: false }); return }
    set({ token, user, isAdmin: user.is_admin, isLoading: false })
  },

  /**
   * Called by useProfile whenever the server profile lands: role and admin
   * status are the server's to decide, so the stored identity follows it.
   * A no-op when nothing changed, so the effect that calls it does not loop.
   */
  syncIdentity: (profile) => {
    const { token, user } = get()
    if (!token || !profile) return
    const next = identityOf({ ...user, ...profile })
    const same = user && ['id', 'phone_number', 'type', 'is_admin'].every((k) => user[k] === next[k])
    if (same) return
    persistAuth(token, next)
    set({ user: next, isAdmin: next.is_admin })
  },

  login: (token, user) => {
    queryClient.clear()
    // Post drafts are keyed by category, not by user, so they outlive a session
    // unless something drops them. Cleared on the way in as well as out: a
    // session that ended without a sign-out must not hand its unfinished
    // listing to whoever signs in next.
    clearAllDrafts()
    const identity = identityOf(user)
    persistAuth(token, identity)
    set({ token, user: identity, isAdmin: identity.is_admin, isLoading: false })
  },

  logout: () => {
    persistClear()
    clearAllDrafts()
    set({ token: null, user: null, isAdmin: false })
    queryClient.clear()
  },
}))
