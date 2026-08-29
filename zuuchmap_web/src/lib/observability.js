import * as Sentry from '@sentry/react'
import { reportError } from './analytics'

/**
 * Client-side error reporting, env-gated on `VITE_SENTRY_DSN`.
 *
 * A crash in the browser was invisible: ErrorBoundary shows the user a
 * fallback and the stack goes to a console nobody is watching. Without the DSN
 * this is a no-op and the bundle keeps the SDK tree-shaken out of the hot path.
 *
 * Never send PII. Phone numbers are the login identifier here, so the default
 * of attaching request bodies and headers would put them in a third-party
 * system — `sendDefaultPii: false` is the SDK default and is set explicitly so
 * an upgrade cannot flip it quietly.
 */
export function initObservability() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    // Errors are what we are here for; traces are billed volume on a small app.
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.Authorization
        delete event.request.headers.authorization
      }
      // The auth flow puts the phone number in the URL query on one screen.
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/(\bphone[^=]*=)[^&]*/gi, '$1<redacted>')
      }
      return event
    },
  })
}

/** Report a caught error that the user was shown a fallback for. */
export function captureError(error, context) {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    if (import.meta.env.DEV) console.error(error, context)
    reportError(error, typeof context === 'string' ? context : JSON.stringify(context ?? ''))
    return
  }
  Sentry.withScope((scope) => {
    if (context) scope.setContext('zuuchmap', context)
    Sentry.captureException(error)
  })
}

// Uncaught errors reach neither an ErrorBoundary nor a query hook.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => captureError(e.error ?? e.message, 'window.error'))
  window.addEventListener('unhandledrejection', (e) => captureError(e.reason, 'unhandledrejection'))
}
