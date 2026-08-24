import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'

const STEPS = ['requested', 'accepted', 'inProgress', 'done']
const TERMINAL = { DECLINED: 'declined', CANCELLED: 'cancelled', EXPIRED: 'expired' }

/** Where a booking sits along Requested → Accepted → In progress → Done. */
export function bookingStage(booking, now = new Date()) {
  if (TERMINAL[booking.status]) return { terminal: TERMINAL[booking.status], index: booking.status === 'DECLINED' ? 1 : 0 }
  if (booking.status !== 'ACCEPTED') return { index: 0 }
  const start = new Date(booking.start_date)
  const end = new Date(booking.end_date); end.setHours(23, 59, 59, 999)
  if (now > end) return { index: 3 }
  if (now >= start) return { index: 2 }
  return { index: 1 }
}

/**
 * Four-step progress rail replacing the status badge on a booking card.
 * A declined/cancelled booking keeps its rail greyed and ends in a cross —
 * the reader still sees how far it got.
 */
export default function BookingTimeline({ booking, className = '' }) {
  const { t } = useTranslation()
  const { index, terminal } = bookingStage(booking)

  return (
    <div className={className}>
      <ol className="flex items-center" aria-label={t('booking.timelineLabel')}>
        {STEPS.map((step, i) => {
          const reached = i <= index
          const current = i === index && !terminal
          const dead = terminal && i > index
          return (
            <li key={step} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <div className="flex flex-col items-center gap-1 min-w-[3.5rem]">
                <span
                  aria-current={current ? 'step' : undefined}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors duration-300 motion-reduce:transition-none ${
                    terminal && i === index
                      ? 'bg-danger/15 border-danger text-danger'
                      : reached
                        ? 'bg-primary border-primary text-on-primary'
                        : 'bg-surface border-border-strong text-transparent'
                  }`}
                >
                  {terminal && i === index ? <X size={11} strokeWidth={3} /> : reached ? <Check size={11} strokeWidth={3} /> : null}
                </span>
                <span className={`text-[10px] leading-tight text-center whitespace-nowrap ${
                  terminal && i === index ? 'text-danger-text font-semibold'
                    : current ? 'text-text font-semibold'
                    : reached ? 'text-text' : dead ? 'text-muted/50' : 'text-muted'
                }`}>
                  {terminal && i === index ? t(`booking.timeline.${terminal}`) : t(`booking.timeline.${step}`)}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`flex-1 h-0.5 mx-1 -mt-4 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                    i < index && !dead ? 'bg-primary' : 'bg-border-strong'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
