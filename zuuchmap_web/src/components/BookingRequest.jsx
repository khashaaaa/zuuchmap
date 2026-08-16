import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarCheck } from 'lucide-react'
import { toast } from 'sonner'
import { bookingsApi } from '@/lib/api'
import InfoSection from '@/components/InfoSection'
import Input from '@/components/Input'

// Request-to-book card shown on rental posts to signed-in customers
export default function BookingRequest({ postId }) {
  const { t } = useTranslation()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const mut = useMutation({
    mutationFn: () => bookingsApi.create({ post_id: postId, start_date: start, end_date: end, message: message || undefined }),
    onSuccess: () => { setSent(true); toast.success(t('booking.submitted')) },
    onError: (e) => toast.error(e.response?.data?.message || t('booking.requestError')),
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
          <label className="text-xs text-muted block mb-1.5">{t('booking.startDate')}</label>
          <Input type="date" value={start} min={today} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1.5">{t('booking.endDate')}</label>
          <Input type="date" value={end} min={start || today} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted block mb-1.5">{t('booking.message')}</label>
        <Input as="textarea" rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder={t('booking.messagePlaceholder')} className="resize-none" />
      </div>
      <button
        onClick={() => {
          if (end < start) { toast.error(t('booking.dateRangeError')); return }
          mut.mutate()
        }}
        disabled={!start || !end || mut.isPending}
        className="w-full py-2 bg-primary text-on-primary font-semibold rounded-btn text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {mut.isPending ? t('common.saving') : t('booking.submit')}
      </button>
    </InfoSection>
  )
}
