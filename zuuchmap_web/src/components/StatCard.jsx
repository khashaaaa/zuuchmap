import { useEffect, useRef, useState } from 'react'
import { motion, animate, useReducedMotion } from 'framer-motion'

export function CountUp({ value }) {
  const shouldReduceMotion = useReducedMotion()
  const played = useRef(false)
  const [display, setDisplay] = useState(() => (shouldReduceMotion ? value : 0))

  useEffect(() => {
    if (played.current || shouldReduceMotion) {
      setDisplay(value)
      return
    }
    played.current = true
    const controls = animate(0, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, shouldReduceMotion])

  return display.toLocaleString()
}

function StatValue({ value }) {
  if (typeof value === 'number') return <CountUp value={value} />
  return value ?? '—'
}

const TONES = {
  surface: 'bg-surface border-border/20',
  // The one actionable number on a stat row gets a ground, not just an accent glyph.
  warning: 'bg-warning/10 border-warning/20',
}

/**
 * `lead` marks the single most important metric on a dashboard: overline label
 * over a display-size number, spanning wider in the caller's grid — so the eye
 * has somewhere to land instead of N interchangeable boxes.
 * `index` staggers entrance in reading order (the landing-hero idiom).
 */
export default function StatCard({ icon: Icon, label, value, color = 'text-primary-text', align = 'center', tone = 'surface', lead = false, index = 0, className = '' }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { delay: shouldReduceMotion ? 0 : Math.min(index, 8) * 0.05 } }}
      className={`${TONES[tone] ?? TONES.surface} border shadow-card rounded-card p-4 ${className}`}
    >
      {lead ? (
        <div className="text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">{label}</p>
          <p className={`text-4xl md:text-5xl font-extrabold tabular-nums ${color}`}><StatValue value={value} /></p>
        </div>
      ) : Icon ? (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-surface2 flex items-center justify-center shrink-0">
            <Icon size={18} className={color} />
          </div>
          <div>
            <p className="text-xs md:text-sm text-muted">{label}</p>
            <p className="text-2xl font-bold text-text mt-0.5 tabular-nums"><StatValue value={value} /></p>
          </div>
        </div>
      ) : (
        <div className={align === 'left' ? 'text-left' : 'text-center'}>
          <p className="text-xs text-muted mb-0.5">{label}</p>
          <p className={`text-xl font-bold tabular-nums ${color}`}><StatValue value={value} /></p>
        </div>
      )}
    </motion.div>
  )
}
