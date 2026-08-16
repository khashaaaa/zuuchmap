import { useEffect, useRef, useState } from 'react'

// Keeps a loading flag `true` for at least `minMs` once it turns true, so a
// skeleton doesn't flash for a few ms on cache hits / fast responses.
export function useMinDisplayTime(isLoading, minMs = 400) {
  const [shown, setShown] = useState(isLoading)
  const startedAtRef = useRef(null)

  useEffect(() => {
    if (isLoading) {
      startedAtRef.current = Date.now()
      setShown(true)
      return undefined
    }
    if (!shown) return undefined
    const elapsed = Date.now() - (startedAtRef.current ?? 0)
    const remaining = minMs - elapsed
    if (remaining <= 0) {
      setShown(false)
      return undefined
    }
    const timer = setTimeout(() => setShown(false), remaining)
    return () => clearTimeout(timer)
  }, [isLoading, minMs])

  return shown
}
