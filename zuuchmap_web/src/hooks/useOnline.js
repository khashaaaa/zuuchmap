import { useEffect, useState } from 'react'

/**
 * Whether the browser currently has a network connection.
 *
 * Lived inside CustomerBrowse, so browse was the only screen that knew about
 * being offline — submitting a post, a booking or a profile edit failed with a
 * generic server error instead. AppLayout now renders one banner from this, and
 * screens that want to change their own behaviour (browse serves its cached
 * page) can call it too.
 *
 * `navigator.onLine` only proves the machine has *a* link, not that our engine
 * is reachable, so this is a hint for the user, never a gate on a request.
 */
export default function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}
