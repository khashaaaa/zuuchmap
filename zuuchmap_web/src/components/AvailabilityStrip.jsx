import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

const DAYS = 14
const toKey = (d) => d.toISOString().slice(0, 10)

/**
 * Next-14-days availability as a row of dots — filled when a booking blocks
 * the day. Rendered only for rental categories (the caller gates on
 * `has_rental_status`); `busyDates` comes from the engine, ISO YYYY-MM-DD.
 */
export default function AvailabilityStrip({ busyDates, size = 'sm', className = '' }) {
  const { t, i18n } = useTranslation()
  const busy = useMemo(() => new Set(busyDates ?? []), [busyDates])
  const days = useMemo(() => {
    const start = new Date(); start.setHours(12, 0, 0, 0)
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i)
      return { key: toKey(d), date: d }
    })
  }, [])
  const freeCount = days.filter((d) => !busy.has(d.key)).length
  const dot = size === 'md' ? 'w-3 h-3' : 'w-2 h-2'
  const fmt = (d) => d.toLocaleDateString(i18n.language === 'mn' ? 'mn-MN' : 'en-GB', { month: 'short', day: 'numeric' })

  const summary = t('posts.availabilityFree', { free: freeCount, total: DAYS })

  // Two rows, always. The old single row put the label, fourteen dots and the
  // summary sentence on one unwrappable line — about 350px of content in a
  // ~255px card, so the sentence fell off the right edge. Giving the dots their
  // own full-width row makes the strip fit any container it is dropped into.
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 ${className}`} aria-label={summary}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">{t('posts.availabilityNext14')}</span>
      {/* The card rung gets the compact figure the app card uses; the detail
          page has the room for the sentence. */}
      <span className="text-xs text-muted tabular-nums whitespace-nowrap ml-auto">
        {size === 'md' ? summary : `${freeCount}/${DAYS}`}
      </span>
      <div className="flex w-full items-center gap-[3px]" aria-hidden="true">
        {days.map((d, i) => {
          const isBusy = busy.has(d.key)
          return (
            <span
              key={d.key}
              title={`${fmt(d.date)} — ${t(isBusy ? 'posts.availabilityBusy' : 'posts.availabilityAvailable')}`}
              className={`${dot} shrink-0 rounded-full transition-colors ${
                isBusy ? 'bg-danger/70' : 'bg-success/80'
              } ${i === 0 ? 'ring-2 ring-primary/40' : ''}`}
            />
          )
        })}
      </div>
    </div>
  )
}
