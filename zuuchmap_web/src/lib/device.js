const DEVICE_KEY = 'zm_device_id'
const ANON_KEY = 'zm_anon_id'

function stableId(key) {
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(key, fresh)
    return fresh
  } catch {
    // Private mode / storage disabled — a per-tab id still beats nothing.
    return crypto.randomUUID()
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
