import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarCheck } from 'lucide-react'
import { toast } from 'sonner'
import { bookingsApi } from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import InfoSection from '@/components/InfoSection'
import Input from '@/components/Input'
import Button from '@/components/Button'

// Request-to-book card shown on rental posts to signed-in customers
export default function BookingRequest({ postId }) {
  const { t } = useTranslation()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [dateError, setDateError] = useState(false)
  // Local calendar day: toISOString() is UTC, which in UTC+8 hands back
  // yesterday before 08:00 and lets a past start date through.
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => bookingsApi.create({ post_id: postId, start_date: start, end_date: end, message: message || undefined }),
    onSuccess: () => { setSent(true); qc.invalidateQueries({ queryKey: ['bookings'] }); toast.success(t('booking.submitted')) },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('booking.requestError'))),
  })

  if (sent) {
    return (
      <InfoSection className="flex items-center gap-2 text-sm text-success">
        <CalendarCheck size={16} /> {t('booking.submitted')}
      </InfoSection>
    )
  }

  return (
    <InfoSection title={t('booking.request')} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted block mb-1.5">{t('booking.startDate')} <span className="text-danger">*</span></label>
          <Input type="date" value={start} min={today} required
            className={dateError ? 'border-danger' : ''}
            onChange={(e) => { setStart(e.target.value); setDateError(false) }} />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1.5">{t('booking.endDate')} <span className="text-danger">*</span></label>
          <Input type="date" value={end} min={start || today} required
            className={dateError ? 'border-danger' : ''}
            onChange={(e) => { setEnd(e.target.value); setDateError(false) }} />
        </div>
      </div>
      {dateError && (
        <p className="text-xs text-danger" role="alert">{t('booking.dateRangeError')}</p>
      )}
      <div>
        <label className="text-xs text-muted block mb-1.5">{t('booking.message')}</label>
        <Input as="textarea" rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder={t('booking.messagePlaceholder')} className="resize-none" />
      </div>
      <Button
        className="w-full"
        onClick={() => {
          // Compare as dates, and show the problem next to the fields it
          // concerns instead of a toast that vanishes.
          if (new Date(end) < new Date(start)) { setDateError(true); return }
          mut.mutate()
        }}
        disabled={!start || !end || mut.isPending}
      >
        {mut.isPending ? t('common.saving') : t('booking.submit')}
      </Button>
    </InfoSection>
  )
}
