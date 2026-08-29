import { analyticsApi } from './api'
import { getAnonId } from './device'

const FLUSH_MS = 5000
const MAX_QUEUE = 25

let queue = []
let timer = null

function flush() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!queue.length) return
  const events = queue
  queue = []
  analyticsApi.collect({ anon_id: getAnonId(), events })
}

/**
 * Records a product event. Batched so a busy screen costs one request, and
 * silent by design — analytics must never interrupt or slow the user.
 *
 * Event names are dotted and stable; the admin funnel reads these exact keys:
 * page.view · browse.search · post.detail.view · auth.start · auth.verified
 * post.create.started · post.create.submitted · booking.requested · contact.revealed
 */
export function track(name, props) {
  queue.push({
    name,
    path: typeof location !== 'undefined' ? location.pathname : undefined,
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    platform: 'web',
    props,
    occurred_at: new Date().toISOString(),
  })

  if (queue.length >= MAX_QUEUE) return flush()
  if (!timer) timer = setTimeout(flush, FLUSH_MS)
}

export const trackPageView = (path) => track('page.view', { path })

const MAX_REPORTS = 10
let reported = 0
const seenErrors = new Set()

/**
 * Crash reporting carried by the analytics pipe — lands in the table
 * /admin/analytics reads. `observability.captureError` calls this whenever
 * Sentry is not configured (the documented default), so a crash is never
 * invisible. Capped and deduped: a render loop must not become a request loop.
 */
export function reportError(error, context) {
  try {
    if (reported >= MAX_REPORTS) return
    const message = String(error?.message ?? error ?? 'unknown').slice(0, 300)
    const key = `${context}|${message}`
    if (seenErrors.has(key)) return
    seenErrors.add(key)
    reported++

    track('client.error', {
      message,
      context,
      stack: typeof error?.stack === 'string' ? error.stack.slice(0, 1000) : undefined,
    })
    flush()
  } catch {
    // The reporter must never become the thing that breaks the page.
  }
}

if (typeof document !== 'undefined') {
  // Send what we have before the tab goes away; visibilitychange is the only
  // hook that reliably fires on mobile browsers.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
