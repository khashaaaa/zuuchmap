import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Clock, CalendarCheck, CalendarDays, Star } from 'lucide-react'
import { reviewsApi } from '@/lib/api'

/** Mean first-response as "~2h" / "~3d" / "<1h"; null when the provider has never replied. */
export function humanizeResponse(hours, t) {
  if (hours === null || hours === undefined) return t('review.statsNoResponse')
  if (hours < 1) return t('review.statsUnderHour')
  if (hours < 48) return t('review.statsHours', { count: Math.round(hours) })
  return t('review.statsDays', { count: Math.round(hours / 24) })
}

/**
 * Trust strip above the reviews: verified, response time, completed jobs,
 * member since, rating. Reads the same query ProviderReviews owns — one
 * fetch, two views.
 */
export default function ProviderCredentials({ providerId, className = '' }) {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['reviews', providerId],
    queryFn: () => reviewsApi.forProvider(providerId),
    enabled: Boolean(providerId),
    staleTime: 60_000,
  })
  const stats = data?.stats
  if (!stats) return null

  const since = stats.member_since ? new Date(stats.member_since).getFullYear() : null
  const items = [
    stats.company_verified && { icon: BadgeCheck, label: t('review.statsVerified'), accent: true },
    stats.avg_response_hours != null && { icon: Clock, label: t('review.statsResponse', { time: humanizeResponse(stats.avg_response_hours, t) }) },
    { icon: CalendarCheck, label: t('review.statsCompleted', { count: stats.completed_bookings ?? 0 }) },
    since && { icon: CalendarDays, label: t('review.statsMemberSince', { year: since }) },
    data.count > 0 && { icon: Star, label: t('review.statsRating'), value: `${Number(data.average).toFixed(1)} (${data.count})` },
  ].filter(Boolean)

  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map(({ icon: Icon, label, value, accent }) => (
        <li
          key={label}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
            accent ? 'bg-success/10 border-success/20 text-success-text font-semibold' : 'bg-surface2 border-border/40 text-text'
          }`}
        >
          <Icon size={13} className={accent ? '' : 'text-primary-text'} aria-hidden="true" />
          {value ? (
            <>
              <span>{label}</span>
              <span className="font-semibold text-text tabular-nums">{value}</span>
            </>
          ) : <span>{label}</span>}
        </li>
      ))}
    </ul>
  )
}
