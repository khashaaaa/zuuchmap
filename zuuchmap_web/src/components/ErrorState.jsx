import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from './Button'

/**
 * The one inline "this failed to load" state.
 *
 * A read failure must never render as an empty list: an empty marketplace and
 * a broken marketplace look identical to a visitor, and only one of them is
 * our fault. Anywhere a query feeds a list or a detail view, this replaces the
 * empty state when `isError` is set.
 */
export default function ErrorState({ onRetry, title, description, compact = false }) {
  const { t } = useTranslation()

  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}
    >
      <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-4">
        <AlertTriangle size={24} className="text-danger" />
      </div>
      <p className="text-text font-medium">{title ?? t('common.loadFailed')}</p>
      <p className="text-sm text-muted mt-1 max-w-xs">
        {description ?? t('common.loadFailedDesc')}
      </p>
      {onRetry && (
        <Button size="md" type="button" onClick={onRetry} className="mt-4">
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
