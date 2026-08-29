const DEVICE_KEY = 'zm_device_id'
const ANON_KEY = 'zm_anon_id'

const randomId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

/**
 * A random id this browser keeps under `key`, minted on first use. Private
 * mode / disabled storage still gets an id — a per-tab one beats nothing, and
 * every caller is a best-effort identifier rather than a credential.
 */
export function stableId(key) {
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const fresh = randomId()
    localStorage.setItem(key, fresh)
    return fresh
  } catch {
    return randomId()
  }
}

/**
 * Identifies this browser to the auth flow so a returning user skips SMS
 * verification (and its 150₮ charge). Only ever sent to our own engine, which
 * stores a hash of it.
 */
export const getDeviceId = () => stableId(DEVICE_KEY)

/** Analytics-only pseudonym. Not tied to identity until the user signs in. */
export const getAnonId = () => stableId(ANON_KEY)
