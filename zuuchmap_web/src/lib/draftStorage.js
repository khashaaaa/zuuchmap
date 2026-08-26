/**
 * Post-form drafts, one per category, in localStorage. Text and attribute
 * values only — image files cannot be serialised, and blob URLs die with the
 * page, so a draft never carries pictures.
 */
const PREFIX = 'zm:postDraft:'
const key = (category) => `${PREFIX}${category}`

export function loadDraft(category) {
  if (!category) return null
  try {
    const raw = localStorage.getItem(key(category))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.form ? parsed : null
  } catch { return null }
}

export function saveDraft(category, form) {
  if (!category) return
  try {
    localStorage.setItem(key(category), JSON.stringify({ form, savedAt: Date.now() }))
  } catch { /* quota / private mode — a lost draft is not an error */ }
}

export function clearDraft(category) {
  if (!category) return
  try { localStorage.removeItem(key(category)) } catch { /* ignore */ }
}

/**
 * Drops every draft, whatever category it belongs to.
 *
 * Called on sign-in and sign-out. A draft carries a title, details, price,
 * contact phone and location, and the key is `zm:postDraft:<category>` with no
 * user in it — so on a shared browser the next person to sign in was offered
 * the previous provider's unfinished listing. The React Query cache and the
 * notification store are already cleared on both transitions; drafts were the
 * one thing that survived them.
 */
export function clearAllDrafts() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch { /* private mode — nothing to clear */ }
}

/** Every stored draft, newest first — so a returning provider is offered the one they left. */
export function listDrafts() {
  try {
    const out = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      const parsed = JSON.parse(localStorage.getItem(k))
      if (parsed?.form) out.push({ category: k.slice(PREFIX.length), savedAt: parsed.savedAt ?? 0, form: parsed.form })
    }
    return out.sort((a, b) => b.savedAt - a.savedAt)
  } catch { return [] }
}
