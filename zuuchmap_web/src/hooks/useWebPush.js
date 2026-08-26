import { useCallback, useEffect, useState } from 'react'
import { webPushApi } from '../lib/api'

/**
 * Browser push subscription.
 *
 * Notifications were Expo push plus an in-app socket, so a provider working
 * from the website received nothing once the tab was closed. This registers the
 * service worker and hands the subscription to the server, where it is stored
 * beside the app's devices and reached by the same fan-out.
 *
 * Permission is never requested on load. A prompt that arrives unexplained is
 * usually denied permanently, and a denied permission cannot be re-asked — so
 * `subscribe()` is called from a control the user chose to press.
 */
const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function useWebPush({ enabled = true } = {}) {
  const [permission, setPermission] = useState(() => (supported() ? Notification.permission : 'unsupported'))
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  // Register early so the worker is active by the time the user opts in, but
  // only register — registering does not prompt for anything.
  useEffect(() => {
    if (!enabled || !supported()) return
    let cancelled = false
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setSubscribed(Boolean(sub))
      })
      .catch(() => {
        // An unregistered worker means no web push. Everything else still works.
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const subscribe = useCallback(async () => {
    if (!supported()) return { ok: false, reason: 'unsupported' }
    setBusy(true)
    try {
      const { key } = await webPushApi.vapidKey()
      // The server decides whether push is configured at all; without a key
      // there is nothing to subscribe to and asking permission would be rude.
      if (!key) return { ok: false, reason: 'not_configured' }

      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return { ok: false, reason: result }

      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          // Chrome refuses a subscription that is not userVisibleOnly — silent
          // push is not available to sites at all.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }))

      const json = sub.toJSON()
      await webPushApi.subscribe(json.endpoint, json.keys)
      setSubscribed(true)
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: err?.message ?? 'failed' }
    } finally {
      setBusy(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    if (!supported()) return
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        // Server first: a browser that unsubscribes locally while the row
        // survives would be pushed to forever with nowhere to deliver.
        await webPushApi.unsubscribe(sub.endpoint).catch(() => {})
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    supported: supported(),
    permission,
    subscribed,
    busy,
    subscribe,
    unsubscribe,
  }
}

export default useWebPush
