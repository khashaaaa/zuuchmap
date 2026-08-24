import { useTranslation } from 'react-i18next'
import { FileClock } from 'lucide-react'
import Button from '@/components/Button'

/** Offers a stored draft back before the form is touched. */
export default function DraftResumeBanner({ savedAt, onResume, onDiscard, className = '' }) {
  const { t } = useTranslation()
  const when = savedAt ? new Date(savedAt).toLocaleString('mn-MN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div role="status" className={`flex flex-wrap items-center gap-3 p-3.5 rounded-card border bg-primary/10 border-primary/20 ${className}`}>
      <FileClock size={20} className="text-primary-text shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-primary-text">{t('provider.draftFound')}</p>
        {when && <p className="text-xs text-muted">{t('provider.draftSavedAt', { time: when })}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onResume}>{t('provider.draftResume')}</Button>
        <Button size="sm" variant="outline" onClick={onDiscard}>{t('provider.draftDiscard')}</Button>
      </div>
    </div>
  )
}
