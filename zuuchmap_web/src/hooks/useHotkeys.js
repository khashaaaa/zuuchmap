import { useEffect, useRef } from 'react'

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Single-key shortcuts for a screen. `bindings` maps a key (`'j'`, `'Enter'`,
 * `'Escape'`, …) to a handler; matching is case-insensitive so caps lock does
 * not silently disable the queue.
 *
 * Deliberately narrow: nothing fires while the user is typing (inputs,
 * textareas, selects, contenteditable), while a modifier is held (browser
 * shortcuts stay theirs), or while a dialog is open — the dialog owns the
 * keyboard then, and "A" landing on the queue behind a reject dialog would
 * approve the post being rejected.
 *
 * Handlers are read through a ref so callers can pass fresh closures every
 * render without re-binding the listener.
 */
export function useHotkeys(bindings, { enabled = true, ignoreWithin } = {}) {
  const ref = useRef(bindings)
  useEffect(() => { ref.current = bindings })

  useEffect(() => {
    if (!enabled) return
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      const el = e.target
      if (el && (EDITABLE.has(el.tagName) || el.isContentEditable)) return
      // Widgets that own the arrow keys themselves — a focused Leaflet map is
      // not an EDITABLE element, so without this a page-level arrow binding
      // silently took its panning away.
      if (ignoreWithin && el?.closest?.(ignoreWithin)) return
      if (document.querySelector('[role="dialog"]')) return
      const map = ref.current
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const handler = map[key]
      if (!handler) return
      e.preventDefault()
      handler(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, ignoreWithin])
}
