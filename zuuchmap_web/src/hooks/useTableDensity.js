import { useState, useCallback } from 'react'

const STORAGE_KEY = 'admin-table-density'

export function useTableDensity() {
  const [density, setDensity] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === 'compact' ? 'compact' : 'comfortable'
    } catch {
      return 'comfortable'
    }
  })

  const toggle = useCallback(() => {
    setDensity((prev) => {
      const next = prev === 'compact' ? 'comfortable' : 'compact'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // localStorage unavailable — density just won't persist
      }
      return next
    })
  }, [])

  return [density, toggle]
}
