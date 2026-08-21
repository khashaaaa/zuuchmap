import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/lib/api'
import { track } from '@/lib/analytics'
import { useAuthStore as useStore } from '@/store'
import Button from '@/components/Button'

/** Client poll cadence. The engine throttles its own upstream calls to 3s. */
const POLL_MS = 2000

export default function VerifyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { state } = useLocation()
  const login = useStore((s) => s.login)

  const [status, setStatus] = useState('PENDING')
  // Tick a clock and derive the countdown from the real expiry, rather than
  // decrementing a counter — a backgrounded tab would otherwise drift.
  const [now, setNow] = useState(() => Date.now())
  const settled = useRef(false)

  const { phone, session_id: sessionId, code, shortcode = '144773', sms_uri: smsUri } = state ?? {}

  function routeFor(user) {
    // Admins are phone-based and may never have picked a provider/customer
    // type — route them straight to the admin app, ahead of the type gate.
    if (user.is_admin) return '/admin'
    if (!user.type) return '/onboarding'
    return user.type === 'PROVIDER' ? '/provider' : '/customer'
  }

  // Landing here without a session (refresh, deep link) has nothing to poll.
  useEffect(() => {
    if (!sessionId) navigate('/login', { replace: true })
  }, [sessionId, navigate])

  const poll = useCallback(async () => {
    if (settled.current) return
    try {
      const res = await authApi.status(sessionId)
      if (res.status === 'VERIFIED' && res.auth) {
        settled.current = true
        setStatus('VERIFIED')
        track('auth.verified', { trusted_device: false })
        login(res.auth.token, res.auth.user)
        navigate(routeFor(res.auth.user), { replace: true })
        return
      }
      if (res.status === 'EXPIRED') {
        settled.current = true
        setStatus('EXPIRED')
      }
    } catch (err) {
      // 410 means the session was already consumed; anything else is transient
      // and the next tick retries.
      if (err?.response?.status === 410) {
        settled.current = true
        setStatus('EXPIRED')
      }
    }
  }, [sessionId, login, navigate])

  useEffect(() => {
    if (!sessionId || status !== 'PENDING') return
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [sessionId, status, poll])

  useEffect(() => {
    if (status !== 'PENDING') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [status])

  if (!sessionId) return null

  const expiresAt = state?.expires_at ? Date.parse(state.expires_at) : now + 300_000
  const secondsLeft = Math.max(0, Math.round((expiresAt - now) / 1000))
  const view = status === 'PENDING' && secondsLeft <= 0 ? 'EXPIRED' : status
  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const secs = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm"
      >
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <h2 className="text-sm font-semibold text-text mb-1">{t('auth.smsTitle')}</h2>
          <p className="text-sm text-muted mb-6">
            {t('auth.smsLead', { shortcode })}
          </p>

          <div className="rounded-card bg-surface2 border border-border/50 p-5 text-center mb-4">
            <p className="text-xs text-muted mb-2">{t('auth.yourCode')}</p>
            <p className="text-3xl font-bold tracking-[0.3em] text-text tabular-nums">{code}</p>
          </div>

          {view === 'PENDING' && (
            <>
              <Button href={smsUri} size="lg" className="w-full mb-3">
                {t('auth.openSms')}
              </Button>
              <p className="text-xs text-muted text-center mb-4">
                {t('auth.manualHint', { code, shortcode, phone })}
              </p>

              <div className="flex items-center justify-center gap-2 text-sm text-muted">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                <span>{t('auth.waiting')}</span>
                <span className="tabular-nums">{mins}:{secs}</span>
              </div>
            </>
          )}

          {view === 'EXPIRED' && (
            <div className="text-center">
              <p className="text-sm text-danger mb-4">{t('auth.expired')}</p>
              <Button to="/login" size="lg" className="w-full">{t('auth.startOver')}</Button>
            </div>
          )}

          {view === 'VERIFIED' && (
            <p className="text-sm text-success text-center">{t('auth.verified')}</p>
          )}
        </div>

        <p className="text-xs text-muted text-center mt-4 leading-relaxed">
          {t('auth.cost')}
        </p>

        <div className="text-center mt-4">
          <Link to="/login" className="text-xs text-muted hover:text-text transition-colors">
            {t('auth.back')}
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
