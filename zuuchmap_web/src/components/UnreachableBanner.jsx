import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellOff } from 'lucide-react'
import AlertBanner from '@/components/AlertBanner'
import { useWebPush } from '@/hooks/useWebPush'
import { useAuthStore } from '@/store'

/**
 * "Nobody can reach you."
 *
 * There is no SMS transport — verify.mn only receives — and signup is by phone,
 * so most accounts carry no email address. Email is a last resort for someone
 * with no registered device at all. Which leaves push as the only way a
 * provider hears that a customer has written, and browser push is off until
 * somebody deliberately turns it on: a provider working from the website is
 * unreachable by default.
 *
 * From the inside that looks like a quiet marketplace rather than a broken
 * inbox, so it has to be said on the screen they actually open.
 */
export default function UnreachableBanner() {
  const { t } = useTranslation()
  const { supported, permission, subscribed, busy, subscribe } = useWebPush()
  const user = useAuthStore((s) => s.user)

  // An email address is a real (if slower) way through, so an account that has
  // one is not unreachable and does not need warning.
  if (user?.email) return null
  if (!supported || subscribed) return null

  return (
    <AlertBanner variant="warning" icon={BellOff} title={t('push.unreachableTitle')} className="mb-4">
      {t('push.unreachableBody')}{' '}
      {permission === 'denied' ? (
        // The browser will not ask again, so a button here would do nothing.
        // Point at the other door instead.
        <>
          {t('push.blocked')}{' '}
          <Link to="/provider/profile" className="underline underline-offset-2 font-medium">
            {t('push.addEmail')}
          </Link>
        </>
      ) : (
        <button
          type="button"
          onClick={subscribe}
          disabled={busy}
          className="underline underline-offset-2 font-medium disabled:opacity-50"
        >
          {t('push.enable')}
        </button>
      )}
    </AlertBanner>
  )
}
