import { useTranslation } from 'react-i18next'
import { FileClock } from 'lucide-react'
import Button from '@/components/Button'
import { formatRelativeAge } from '@/lib/utils'

/**
 * Offers a stored draft back before the form is touched.
 *
 * The age is relative — "5 минутын өмнө" — not the wall-clock time it was
 * saved at. What a provider needs to decide is whether this is the thing they
 * were just writing or something they abandoned last week, and an absolute
 * `09/11, 14:32` makes them do that subtraction themselves. The app's banner
 * has always said it this way; this one said the other, for the same draft.
 */
export default function DraftResumeBanner({ savedAt, onResume, onDiscard, className = '' }) {
  const { t } = useTranslation()
  const when = savedAt ? formatRelativeAge(savedAt, t) : null
  return (
    <div role="status" className={`flex flex-wrap items-center gap-3 p-3.5 rounded-card border bg-primary/10 border-primary/20 ${className}`}>
      <FileClock size={20} className="text-primary-text shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-primary-text">{t('provider.draftFound')}</p>
        {when && <p className="text-xs text-muted">{t('provider.draftSavedAgo', { time: when })}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onResume}>{t('provider.draftResume')}</Button>
        <Button size="sm" variant="outline" onClick={onDiscard}>{t('provider.draftDiscard')}</Button>
      </div>
    </div>
  )
}
