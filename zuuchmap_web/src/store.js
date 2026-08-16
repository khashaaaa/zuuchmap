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

  hydrate: async () => {
    const token = getToken()
    const user = getUser()
    if (!token || !user) { set({ isLoading: false }); return }
    set({ token, user, isAdmin: user.is_admin === true, isLoading: false })
    try {
      const profile = await usersApi.getProfile()
      if (profile.is_admin !== user.is_admin) {
        const updated = { ...user, is_admin: profile.is_admin === true }
        persistAuth(token, updated)
        set({ user: updated, isAdmin: profile.is_admin === true })
      }
    } catch {} // silent — server unreachable or token expired (401 handler redirects)
  },

  login: (token, user) => {
    queryClient.clear()
    persistAuth(token, user)
    set({ token, user, isAdmin: user.is_admin === true, isLoading: false })
  },

  logout: () => {
    persistClear()
    set({ token: null, user: null, isAdmin: false })
    queryClient.clear()
  },
}))
