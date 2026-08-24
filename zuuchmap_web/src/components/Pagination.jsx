import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Page numbers around the current page, with the first and last always
 * reachable and gaps collapsed to an ellipsis:
 *   1 … 7 8 [9] 10 11 … 51
 * Prev/next alone meant the only route to a distant page was one click at a
 * time, which a multi-thousand-listing catalogue makes unusable.
 */
function pageItems(page, totalPages) {
  const window = 1 // pages either side of the current one
  const pages = new Set([1, totalPages, page])
  for (let i = 1; i <= window; i++) {
    if (page - i > 1) pages.add(page - i)
    if (page + i < totalPages) pages.add(page + i)
  }
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const out = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push({ gap: true, key: `gap-${p}` })
    out.push({ page: p, key: p })
    prev = p
  }
  return out
}

export default function Pagination({ page, total, limit, onChange, labels = {} }) {
  const totalPages = Math.ceil(total / limit)
  if (totalPages <= 1) return null

  // Paging without this left the viewport at the bottom of the old page, so the
  // next one appeared to open halfway down.
  const go = (next) => {
    if (next === page || next < 1 || next > totalPages) return
    onChange(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const arrow = 'p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-btn border border-border/50 text-muted hover:text-text hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors'

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 mt-6" aria-label={labels.nav ?? 'Pagination'}>
      <button onClick={() => go(page - 1)} disabled={page <= 1} aria-label={labels.previous ?? 'Previous page'} className={arrow}>
        <ChevronLeft size={16} />
      </button>

      {pageItems(page, totalPages).map((item) =>
        item.gap ? (
          <span key={item.key} className="px-1 text-sm text-muted select-none" aria-hidden="true">…</span>
        ) : (
          <button
            key={item.key}
            onClick={() => go(item.page)}
            aria-current={item.page === page ? 'page' : undefined}
            aria-label={`${labels.page ?? 'Page'} ${item.page}`}
            className={`min-w-[44px] min-h-[44px] px-2 rounded-btn border text-sm tabular-nums transition-colors ${
              item.page === page
                ? 'border-primary bg-primary text-on-primary font-semibold'
                : 'border-border/50 text-muted hover:text-text hover:border-primary/40'
            }`}
          >
            {item.page}
          </button>
        ),
      )}

      <button onClick={() => go(page + 1)} disabled={page >= totalPages} aria-label={labels.next ?? 'Next page'} className={arrow}>
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}
