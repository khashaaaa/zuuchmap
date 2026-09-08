import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }))
vi.mock('./lib/draftStorage', () => ({ clearAllDrafts: vi.fn() }))

import { useAuthStore, useNotificationStore } from './store'
import { queryClient } from './lib/queryClient'
import { clearAllDrafts } from './lib/draftStorage'

/**
 * The two pieces of client state that outlive a page load.
 *
 * Both hold something that belongs to ONE account — a session, and a
 * notification list — in storage that does not empty itself between them. The
 * tests below are mostly about that boundary: what must not survive from one
 * user to the next on a shared browser.
 */

const token = (payload) =>
  `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.y`

const live = () => token({ exp: Math.floor(Date.now() / 1000) + 3600 })
const dead = () => token({ exp: Math.floor(Date.now() / 1000) - 3600 })

const reset = () => {
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, isAdmin: false, isLoading: true })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
  vi.clearAllMocks()
}

describe('useAuthStore', () => {
  beforeEach(reset)

  it('keeps only the identity fields from the login response', () => {
    useAuthStore.getState().login(live(), {
      id: 'u1', phone_number: '99119911', type: 'CUSTOMER', is_admin: false,
      // The full profile belongs in React Query; anything extra stored here
      // goes stale the moment the server's copy changes.
      given_name: 'Bat', profile_picture: 'a.jpg', email: 'b@c.mn',
    })
    expect(useAuthStore.getState().user).toEqual({
      id: 'u1', phone_number: '99119911', type: 'CUSTOMER', is_admin: false,
    })
  })

  it('treats is_admin as strictly true, never merely truthy', () => {
    // The whole admin UI hangs off this. A server sending "false", 1, or the
    // string "true" must not open the console by accident.
    for (const value of ['true', 1, 'yes', {}, 'false']) {
      useAuthStore.getState().login(live(), { id: 'u1', is_admin: value })
      expect(useAuthStore.getState().isAdmin).toBe(false)
    }
    useAuthStore.getState().login(live(), { id: 'u1', is_admin: true })
    expect(useAuthStore.getState().isAdmin).toBe(true)
  })

  it('drops another user’s drafts and cached queries on the way IN', () => {
    // Not only on logout: a session that ended without a sign-out must not hand
    // its unfinished listing to whoever signs in next on the same browser.
    useAuthStore.getState().login(live(), { id: 'u2' })
    expect(clearAllDrafts).toHaveBeenCalled()
    expect(queryClient.clear).toHaveBeenCalled()
  })

  it('clears everything on logout', () => {
    useAuthStore.getState().login(live(), { id: 'u1', is_admin: true })
    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
    expect(state.isAdmin).toBe(false)
    expect(clearAllDrafts).toHaveBeenCalled()
    expect(queryClient.clear).toHaveBeenCalled()
  })

  it('hydrates a live session without waiting on the network', () => {
    useAuthStore.getState().login(live(), { id: 'u1', type: 'PROVIDER', is_admin: false })
    useAuthStore.setState({ token: null, user: null, isAdmin: false, isLoading: true })

    useAuthStore.getState().hydrate()
    expect(useAuthStore.getState().user?.id).toBe('u1')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('refuses to hydrate an expired token, so the shell never flashes', () => {
    // Committing an expired token painted the signed-in shell, which the 401
    // handler then tore away — the user watched their dashboard flash past.
    useAuthStore.getState().login(dead(), { id: 'u1' })
    useAuthStore.setState({ token: null, user: null, isAdmin: false, isLoading: true })

    useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  it('follows the server when it revises the role', () => {
    useAuthStore.getState().login(live(), { id: 'u1', type: 'CUSTOMER', is_admin: false })
    useAuthStore.getState().syncIdentity({ id: 'u1', type: 'PROVIDER', is_admin: true })

    expect(useAuthStore.getState().user.type).toBe('PROVIDER')
    expect(useAuthStore.getState().isAdmin).toBe(true)
  })

  it('does not re-set state when the profile says nothing new', () => {
    useAuthStore.getState().login(live(), { id: 'u1', phone_number: '9911', type: 'CUSTOMER', is_admin: false })
    const before = useAuthStore.getState().user

    useAuthStore.getState().syncIdentity({ id: 'u1', phone_number: '9911', type: 'CUSTOMER', is_admin: false })
    // Same object identity, or the effect that calls this loops forever.
    expect(useAuthStore.getState().user).toBe(before)
  })

  it('ignores a profile sync when there is no session', () => {
    useAuthStore.getState().syncIdentity({ id: 'u1', is_admin: true })
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('useNotificationStore.scopeTo', () => {
  beforeEach(reset)

  it('drops notifications belonging to a different account', () => {
    useNotificationStore.setState({
      notifications: [{ id: 1, read: false }], unreadCount: 1,
    })
    localStorage.setItem('zm_notifications_user', 'u1')

    useNotificationStore.getState().scopeTo('u2')
    expect(useNotificationStore.getState().notifications).toEqual([])
    expect(useNotificationStore.getState().unreadCount).toBe(0)
  })

  it('keeps them for the same account', () => {
    useNotificationStore.getState().scopeTo('u1')
    useNotificationStore.setState({ notifications: [{ id: 1, read: false }], unreadCount: 1 })

    useNotificationStore.getState().scopeTo('u1')
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
  })

  it('drops unattributable entries that predate the owner stamp', () => {
    useNotificationStore.setState({ notifications: [{ id: 1, read: false }], unreadCount: 1 })
    useNotificationStore.getState().scopeTo('u1')
    expect(useNotificationStore.getState().notifications).toEqual([])
  })
})
