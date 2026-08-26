import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import { reportsApi } from '@/lib/api'

/**
 * Flag a listing that is already live.
 *
 * Moderation was pre-approval only: an admin sees a listing once, and anything
 * that goes wrong afterwards — a rental that no longer exists, a number that
 * turns out to be a scam, a price edited into bait — stayed up until someone
 * happened to look. This is the channel back.
 *
 * Reasons come from the server (`GET /reports/reasons`) rather than a list
 * kept here, so the two cannot drift; the labels are translated client-side.
 */
const REASONS = ['SPAM', 'SCAM', 'WRONG_INFO', 'UNAVAILABLE', 'OFFENSIVE', 'OTHER']

export default function ReportModal({ open, onClose, postId }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState(REASONS[0])
  const [detail, setDetail] = useState('')

  const mutation = useMutation({
    mutationFn: () => reportsApi.create(postId, reason, detail.trim() || undefined),
    onSuccess: (result) => {
      // A repeat report is not an error — the server hands back the existing
      // one rather than queueing a second read of the same complaint.
      toast.success(result?.duplicate ? t('report.duplicate') : t('report.submitted'))
      setDetail('')
      onClose()
    },
    onError: () => toast.error(t('report.failed')),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('report.title')}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t('report.submitting') : t('report.submit')}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted mb-4">{t('report.lead')}</p>

      <fieldset>
        <legend className="text-xs uppercase tracking-wide text-muted mb-2">{t('report.reason')}</legend>
        <div className="space-y-1.5">
          {REASONS.map((key) => (
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
        <span className="text-xs uppercase tracking-wide text-muted">{t('report.detail')}</span>
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
