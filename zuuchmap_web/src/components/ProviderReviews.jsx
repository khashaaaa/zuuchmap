import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { reviewsApi } from '@/lib/api'
import InfoSection from '@/components/InfoSection'
import Input from '@/components/Input'
import Button from '@/components/Button'
import UserAvatar from '@/components/UserAvatar'
import ErrorState from '@/components/ErrorState'
import { formatDate } from '@/lib/utils'
import { useApiMutation } from '@/hooks/useApiMutation'

export function Stars({ value, size = 14, onSelect }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const star = (
          <Star
            size={size}
            className={i <= value ? 'text-warning fill-warning' : 'text-border-strong'}
          />
        )
        // The interactive variant is the only rating input — it has to be a
        // real button so keyboard and screen-reader users can rate at all.
        return onSelect ? (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={t('review.rateStars', { count: i })}
            aria-pressed={i <= value}
            className="cursor-pointer rounded p-1.5 -m-0.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            {star}
          </button>
        ) : (
          <span key={i}>{star}</span>
        )
      })}
    </span>
  )
}

/** Reviews shown before the list asks to be expanded. */
const REVIEW_PREVIEW = 5

// Rating summary + review list + own-review form for a provider
export default function ProviderReviews({ providerId, canReview }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [showAll, setShowAll] = useState(false)

  const { data, isError, refetch } = useQuery({
    queryKey: ['reviews', providerId],
    queryFn: () => reviewsApi.forProvider(providerId),
    enabled: Boolean(providerId),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data?.own) {
      setRating(data.own.rating)
      setComment(data.own.comment ?? '')
    }
  }, [data?.own])

  const mut = useApiMutation({
    // Send the empty string rather than dropping the key: omitting it reads as
    // "leave the comment alone", which silently kept the old text under the new
    // rating. The trim keeps whitespace from counting as a comment.
    mutationFn: () => reviewsApi.upsert({ provider_id: providerId, rating, comment: comment.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', providerId] })
      toast.success(t('review.submitted'))
    },
  })

  if (!providerId) return null
  // A failed load must not silently erase the reviews section — trust signals
  // vanishing without a trace reads as "this provider has no reputation".
  if (isError) return (
    <InfoSection title={t('review.title')}>
      <ErrorState compact onRetry={refetch} />
    </InfoSection>
  )
  if (!data) return null
  const { average, count, reviews } = data

  return (
    <InfoSection title={t('review.title')} className="space-y-3">
      <div className="flex items-center gap-2">
        <Stars value={Math.round(average)} />
        <span className="text-sm font-semibold text-text">{count ? average.toFixed(1) : '—'}</span>
        <span className="text-xs text-muted">{t('review.count', { count })}</span>
      </div>

      {canReview && (
        <div className="bg-surface2 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{t('review.yourRating')}</span>
            <Stars value={rating} size={18} onSelect={setRating} />
          </div>
          <Input as="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={t('review.comment')} className="resize-none bg-background" />
          <Button size="sm" onClick={() => mut.mutate()} disabled={!rating || mut.isPending}>
            {mut.isPending ? t('common.saving') : t('review.submit')}
          </Button>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="text-xs text-muted">{t('review.empty')}</p>
      ) : (
        <div className="space-y-2">
          {(showAll ? reviews : reviews.slice(0, REVIEW_PREVIEW)).map((r) => (
            <div key={r.id} className="flex items-start gap-2.5 bg-surface2 rounded-lg p-3">
              <UserAvatar src={r.author?.profile_picture} name={r.author?.given_name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-text">{r.author?.given_name || '—'}</span>
                  <Stars value={r.rating} size={11} />
                  <span className="text-xs text-muted">{formatDate(r.date_updated)}</span>
                </div>
                {r.comment && <p className="text-sm text-text mt-1 leading-relaxed">{r.comment}</p>}
              </div>
            </div>
          ))}
          {reviews.length > REVIEW_PREVIEW && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs text-primary-text hover:underline"
            >
              {t('review.showAll', { count: reviews.length })}
            </button>
          )}
        </div>
      )}
    </InfoSection>
  )
}
