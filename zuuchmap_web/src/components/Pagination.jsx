import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, total, limit, onChange }) {
  const totalPages = Math.ceil(total / limit)
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-btn border border-border/50 text-muted hover:text-text hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm text-muted px-2">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-btn border border-border/50 text-muted hover:text-text hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
