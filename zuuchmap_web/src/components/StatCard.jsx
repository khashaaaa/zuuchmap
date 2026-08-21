import { useEffect, useRef, useState } from 'react'
import { motion, animate, useReducedMotion } from 'framer-motion'

function CountUp({ value }) {
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

export default function StatCard({ icon: Icon, label, value, color = 'text-primary-text', align = 'center', className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-surface border border-border/20 shadow-card rounded-card p-4 ${className}`}
    >
      {Icon ? (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-surface2 flex items-center justify-center shrink-0">
            <Icon size={18} className={color} />
          </div>
          <div>
            <p className="text-xs md:text-sm text-muted">{label}</p>
            <p className="text-2xl md:text-3xl font-bold text-text mt-0.5 tabular-nums"><StatValue value={value} /></p>
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
