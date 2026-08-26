import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export default function SettingsMenu({ items, className = '' }) {
  return (
    <div className={`surface-card ${className}`}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        const baseClass = `flex items-center justify-between w-full min-h-touch px-4 py-3 text-sm transition-colors ${isLast ? '' : 'border-b border-border/50'}`

        if (item.to) {
          return (
            <Link
              key={item.key ?? item.to}
              to={item.to}
              className={`${baseClass} text-text hover:bg-surface2`}
            >
              <span className="flex items-center gap-2">
                {item.icon && <item.icon size={14} />}
                {item.label}
              </span>
              <ChevronRight size={14} className="text-muted shrink-0" />
            </Link>
          )
        }

        return (
          <button
            key={item.key ?? item.label}
            type="button"
            onClick={item.onClick}
            className={`${baseClass} ${item.variant === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-text hover:bg-surface2'}`}
          >
            <span className="flex items-center gap-2">
              {item.icon && <item.icon size={14} />}
              {item.label}
            </span>
            <ChevronRight size={14} className="text-muted shrink-0" />
          </button>
        )
      })}
    </div>
  )
}
