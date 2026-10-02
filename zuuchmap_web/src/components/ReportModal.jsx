import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import { reportsApi, REPORT_REASONS } from '@/lib/api'

/**
 * Flag a listing that is already live.
 *
 * Moderation was pre-approval only: an admin sees a listing once, and anything
 * that goes wrong afterwards — a rental that no longer exists, a number that
 * turns out to be a scam, a price edited into bait — stayed up until someone
 * happened to look. This is the channel back.
 *
 * Reasons come from the server (`GET /reports/reasons`); the list below is only
 * the offline/first-paint fallback and is held to the engine's by check:sync.
 * Labels are translated client-side under `report.reasons.<KEY>`.
 *
 * Files against a listing (`postId`) or a review (`reviewId`) — exactly one.
 * No reason is preselected: a default meant a reporter who tapped straight
 * through filed whatever came first, and the queue is triaged by reason.
 */

export default function ReportModal({ open, onClose, postId, reviewId }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState(null)
  const [detail, setDetail] = useState('')
  const isReview = reviewId != null
  const close = () => {
    setReason(null)
    setDetail('')
    onClose()
  }

  const { data: reasons = REPORT_REASONS } = useQuery({
    queryKey: ['reports', 'reasons'],
    queryFn: reportsApi.reasons,
    staleTime: Infinity,
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () => reportsApi.create(
      isReview ? { review_id: reviewId } : { post_id: postId },
      reason,
      detail.trim() || undefined,
    ),
    onSuccess: (result) => {
      // A repeat report is not an error — the server hands back the existing
      // one rather than queueing a second read of the same complaint.
      const duplicate = isReview ? t('report.duplicateReview') : t('report.duplicate')
      toast.success(result?.duplicate ? duplicate : t('report.submitted'))
      close()
    },
    onError: () => toast.error(t('report.failed')),
  })

  return (
    <Modal
      open={open}
      onClose={close}
      title={isReview ? t('report.titleReview') : t('report.title')}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={close}>{t('common.cancel')}</Button>
          <Button onClick={() => mutation.mutate()} disabled={!reason || mutation.isPending}>
            {mutation.isPending ? t('report.submitting') : t('report.submit')}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted mb-4">{t('report.lead')}</p>

      <fieldset>
        <legend className="text-xs font-semibold text-muted mb-2">{t('report.reason')}</legend>
        <div className="space-y-1.5">
          {reasons.map((key) => (
            <label
              key={key}
              className="flex items-start gap-2 p-2 rounded-btn hover:bg-surface2 cursor-pointer"
            >
              <input
                type="radio"
                name="report-reason"
                value={key}
                checked={reason === key}
                onChange={() => setReason(key)}
                className="mt-0.5 accent-[var(--color-primary)]"
              />
              <span className="text-sm text-text">{t(`report.reasons.${key}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block mt-4">
        <span className="text-xs font-semibold text-muted">{t('report.detail')}</span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={t('report.detailPlaceholder')}
          rows={3}
          maxLength={1000}
          className="mt-1 w-full bg-surface2 border border-transparent rounded-btn px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-primary resize-y"
        />
      </label>
    </Modal>
  )
}
