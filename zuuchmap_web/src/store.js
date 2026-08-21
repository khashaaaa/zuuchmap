import { create } from 'zustand'
import { getToken, getUser, setAuth as persistAuth, clearAuth as persistClear } from './lib/auth'
import { usersApi } from './lib/api'
import { queryClient } from './lib/queryClient'

export const useThemeStore = create((set) => ({
  theme: document.documentElement.getAttribute('data-theme') || 'dark',
  toggleTheme: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('zm_theme', next)
    document.documentElement.setAttribute('data-theme', next)
    return { theme: next }
  }),
}))

export const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,
  add: (notification) => set((s) => ({
    notifications: [{ ...notification, id: Date.now(), ts: new Date().toISOString(), read: false }, ...s.notifications].slice(0, 30),
    unreadCount: s.unreadCount + 1,
  })),
  markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })), unreadCount: 0 })),
  clear: () => set({ notifications: [], unreadCount: 0 }),
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

  hydrate: async () => {
    const token = getToken()
    const user = getUser()
    if (!token || !user) { set({ isLoading: false }); return }
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
