import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Modal-surface keyboard contract: Escape dismisses, Tab cycles inside the
 * panel, the panel takes focus on open and (optionally) hands it back on
 * close. Without it keyboard users tab into the page behind the scrim and
 * cannot get out.
 *
 * `onEscape` is read through the latest closure on every keypress, so callers
 * need not memoise it.
 */
export function useFocusTrap(ref, active, { onEscape, restoreFocus = false, autoFocus = true } = {}) {
  const onEscapeRef = useRef(onEscape)
  useEffect(() => { onEscapeRef.current = onEscape })
  useEffect(() => {
    if (!active) return
    const previouslyFocused = restoreFocus ? document.activeElement : null

    const handler = (e) => {
      if (e.key === 'Escape') { onEscapeRef.current?.(); return }
      if (e.key !== 'Tab') return
      const panel = ref.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handler)
    if (autoFocus) ref.current?.focus()
    return () => {
      window.removeEventListener('keydown', handler)
      previouslyFocused?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
