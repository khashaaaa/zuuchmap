const TOKEN_KEY = 'zm_token'
const USER_KEY = 'zm_user'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const getUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null } }
export const setAuth = (token, user) => { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)) }
export const clearAuth = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) }

/**
 * Whether a stored JWT has already expired, decided locally.
 *
 * The `exp` claim is right there in the token, so a dead session can be
 * recognised before it is committed to state — no network round-trip, and no
 * flash of the signed-in shell on the way to the login screen. Anything
 * unparseable counts as expired: a token we cannot read is one we cannot use.
 *
 * This is a UX shortcut, never a security check — the server validates the
 * signature on every request and is the only thing that decides what a token
 * is allowed to do.
 */
export const isTokenExpired = (token) => {
  if (!token) return true
  try {
    const [, payload] = token.split('.')
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof exp !== 'number' || exp * 1000 <= Date.now()
  } catch { return true }
}
