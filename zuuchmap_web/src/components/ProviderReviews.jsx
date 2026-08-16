import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { reviewsApi } from '@/lib/api'
import InfoSection from '@/components/InfoSection'
import Input from '@/components/Input'
import UserAvatar from '@/components/UserAvatar'
import { formatDate } from '@/lib/utils'

export function Stars({ value, size = 14, onSelect }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={`${i <= value ? 'text-warning fill-warning' : 'text-border'} ${onSelect ? 'cursor-pointer' : ''}`}
          onClick={onSelect ? () => onSelect(i) : undefined}
        />
      ))}
    </span>
  )
}

// Rating summary + review list + own-review form for a provider
export default function ProviderReviews({ providerId, canReview }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')

  const { data } = useQuery({
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

  const mut = useMutation({
    mutationFn: () => reviewsApi.upsert({ provider_id: providerId, rating, comment: comment || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', providerId] })
      toast.success(t('review.submitted'))
    },
    onError: (e) => {
      if (e.response?.status === 403) toast.error(t('review.notEligible'))
      else toast.error(t('common.error'))
    },
  })

  if (!providerId || !data) return null
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
          <button
            onClick={() => mut.mutate()}
            disabled={!rating || mut.isPending}
            className="px-4 py-1.5 bg-primary text-on-primary font-semibold rounded-btn text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {mut.isPending ? t('common.saving') : t('review.submit')}
          </button>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="text-xs text-muted">{t('review.empty')}</p>
      ) : (
        <div className="space-y-2">
          {reviews.slice(0, 10).map((r) => (
            <div key={r.id} className="flex items-start gap-2.5 bg-surface2 rounded-lg p-3">
              <UserAvatar src={r.author?.profile_picture} name={r.author?.given_name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-text">{r.author?.given_name || '—'}</span>
                  <Stars value={r.rating} size={11} />
                  <span className="text-[11px] text-muted">{formatDate(r.date_updated)}</span>
                </div>
                {r.comment && <p className="text-xs text-muted mt-1">{r.comment}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </InfoSection>
  )
}
