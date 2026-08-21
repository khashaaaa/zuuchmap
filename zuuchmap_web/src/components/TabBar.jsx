import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export default function TabBar({ tabs, value, onChange, className = '' }) {
  const indicatorId = useId()
  const shouldReduceMotion = useReducedMotion()
  return (
    <div className={`flex gap-1 bg-surface2 rounded-lg p-1 w-fit max-w-full overflow-x-auto ${className}`}>
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`relative px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
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
