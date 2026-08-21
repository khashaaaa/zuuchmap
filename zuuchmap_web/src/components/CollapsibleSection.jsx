import { ChevronDown } from 'lucide-react'

// variant "boxed" — its own bordered card, for use on plain backgrounds.
// variant "bare" — matches InfoSection's `pt-4 border-t`, for nesting inside an existing card.
export default function CollapsibleSection({ title, defaultOpen = true, children, className = '', variant = 'boxed' }) {
  const isBare = variant === 'bare'
  return (
    <details
      open={defaultOpen}
      className={`group [&::-webkit-details-marker]:hidden ${isBare ? 'pt-4 border-t border-border/50' : 'border border-border/20 shadow-card rounded-card bg-surface'} ${className}`}
    >
      <summary className={`cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-text ${isBare ? '' : 'px-4 py-3'}`}>
        {title}
        <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className={isBare ? 'pt-3 space-y-4' : 'px-4 pb-4 pt-1 space-y-4 border-t border-border/50'}>
        {children}
      </div>
    </details>
  )
}
