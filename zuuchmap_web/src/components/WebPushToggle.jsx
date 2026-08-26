import { useTranslation } from 'react-i18next'
import { Bell, BellOff } from 'lucide-react'
import Button from '@/components/Button'
import { useWebPush } from '@/hooks/useWebPush'

/**
 * Opt in to browser notifications.
 *
 * Deliberately a control the user presses rather than a prompt on load: a
 * permission request that arrives unexplained is usually denied, and a denied
 * permission cannot be asked for again. So the reason is on screen before the
 * browser's dialog is.
 */
export default function WebPushToggle() {
  const { t } = useTranslation()
  const { supported, permission, subscribed, busy, subscribe, unsubscribe } = useWebPush()

  if (!supported) return null

  return (
    <section className="mt-4 rounded-card bg-surface p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-btn bg-surface2 flex items-center justify-center shrink-0">
        {subscribed ? (
          <Bell size={16} className="text-primary-text" />
        ) : (
          <BellOff size={16} className="text-muted" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-text">{t('push.title')}</p>
        <p className="text-sm text-muted mt-0.5">
          {permission === 'denied' ? t('push.blocked') : t('push.description')}
        </p>
      </div>

      {permission !== 'denied' && (
        <Button
          size="sm"
          variant={subscribed ? 'secondary' : 'primary'}
          disabled={busy}
          onClick={async () => {
            if (subscribed) return unsubscribe()
            const result = await subscribe()
            // `not_configured` means the server has no VAPID keys — say so
            // rather than leaving a button that silently does nothing.
            if (!result.ok && result.reason === 'not_configured') {
              // eslint-disable-next-line no-alert
              window.alert(t('push.notConfigured'))
            }
          }}
        >
          {subscribed ? t('push.disable') : t('push.enable')}
        </Button>
      )}
    </section>
  )
}
