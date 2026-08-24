import { useId } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@/i18n'
import Button from '@/components/Button'
import Logo from '@/components/Logo'
import { useAuthStore } from '@/store'

/** Where a signed-in user's own app lives, by role. */
function dashboardPath(user, isAdmin) {
  if (isAdmin) return '/admin'
  return user?.type === 'PROVIDER' ? '/provider' : '/customer'
}

/**
 * Header for the pages a signed-out visitor can reach. Deliberately lighter
 * than AppLayout's header: no sidebar, no notifications, nothing that implies
 * an account the visitor does not have yet.
 */
export default function PublicHeader() {
  const { t, i18n } = useTranslation()
  const indicatorId = useId()
  const shouldReduceMotion = useReducedMotion()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isAdmin = useAuthStore((s) => s.isAdmin)

  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border/20">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <Logo />
          <span className="font-bold text-text">ZuuchMap</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-btn border border-border/40 overflow-hidden" role="group" aria-label={t('settings.language')}>
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => i18n.changeLanguage(lang.code)}
                aria-pressed={i18n.resolvedLanguage === lang.code}
                className={`relative min-h-[36px] px-3 py-2 text-xs font-medium transition-colors ${
                  i18n.resolvedLanguage === lang.code
                    ? 'text-text'
                    : 'text-muted hover:text-text'
                }`}
              >
                {i18n.resolvedLanguage === lang.code && (
                  <motion.span
                    layoutId={indicatorId}
                    transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                    className="absolute inset-0 bg-surface2"
                    aria-hidden="true"
                  />
                )}
                <span className="relative">{lang.code.toUpperCase()}</span>
              </button>
            ))}
          </div>
          {token
            ? <Button to={dashboardPath(user, isAdmin)} size="sm">{t('nav.dashboard')}</Button>
            : <Button to="/login" size="sm">{t('auth.title')}</Button>}
        </div>
      </div>
    </header>
  )
}
