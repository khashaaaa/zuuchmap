import { useEffect, useId, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export default function TabBar({ tabs, value, onChange, className = '' }) {
  const indicatorId = useId()
  const shouldReduceMotion = useReducedMotion()
  // The row scrolls sideways on a phone, and nothing said so: the last tab was
  // simply cut at the edge ("Түүх (") and read as a rendering fault. Fade the
  // side that has more behind it.
  const rowRef = useRef(null)
  const [more, setMore] = useState({ left: false, right: false })
  useEffect(() => {
    const el = rowRef.current
    if (!el) return undefined
    const measure = () => {
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [tabs.length])
  // Keep the selected tab on screen: a page that opens on its third tab
  // otherwise selects one that is past the edge.
  useEffect(() => {
    const el = rowRef.current
    const active = el?.querySelector('[aria-selected="true"]')
    if (!el || !active) return
    const left = active.offsetLeft - 8
    const right = active.offsetLeft + active.offsetWidth + 8
    if (left < el.scrollLeft) el.scrollLeft = left
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth
  }, [value, tabs.length])
  const fade = more.left || more.right
    ? `linear-gradient(to right, ${more.left ? 'transparent, black 2rem' : 'black'}, ${more.right ? 'black calc(100% - 2rem), transparent' : 'black'})`
    : undefined
  return (
    <div
      ref={rowRef}
      role="tablist"
      style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
      className={`flex gap-1 bg-surface2 rounded-inset p-1 w-fit max-w-full overflow-x-auto ${className}`}
    >
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.key}
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={`relative min-h-[36px] px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            value === tab.key ? 'text-on-primary' : 'text-muted hover:text-text'
          }`}
        >
          {value === tab.key && (
            <motion.span
              layoutId={indicatorId}
              transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
              className="absolute inset-0 rounded-md bg-primary"
              aria-hidden="true"
            />
          )}
          <span className="relative">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
