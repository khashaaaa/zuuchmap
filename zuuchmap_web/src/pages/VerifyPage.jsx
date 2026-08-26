import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Copy, Check } from 'lucide-react'
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
  const [copied, setCopied] = useState(false)
  // `sms:` resolves on phones and does nothing on a desktop browser, so the
  // primary action has to differ. A coarse pointer is the closest honest proxy
  // for "this device has a messaging app"; both actions stay available either
  // way, only their prominence swaps.
  const canSms = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  // Tick a clock and derive the countdown from the real expiry, rather than
  // decrementing a counter — a backgrounded tab would otherwise drift.
  const [now, setNow] = useState(() => Date.now())
  const settled = useRef(false)

  const { session_id: sessionId, code, shortcode = '144773', sms_uri: smsUri } = state ?? {}

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(String(code))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Insecure context or a browser that refuses — select the digits so the
      // user can still copy with the keyboard rather than transcribing them.
      const el = document.getElementById('verify-code')
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }

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

  const steps = [
    t('auth.step1'),
    t('auth.step2', { shortcode }),
    t('auth.step3'),
  ]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm"
      >
        <div className="relative overflow-hidden bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <h2 className="text-sm font-semibold text-text mb-1">{t('auth.smsTitle')}</h2>
          <p className="text-sm text-muted mb-5">
            {t('auth.smsLead', { shortcode })}
          </p>

          {/* This flow inverts the SMS convention — *you* text *us* — so both
              halves of the instruction get equal staging: code → shortcode. */}
          <div className="flex items-stretch gap-2 mb-5">
            <div className="flex-1 rounded-card bg-surface2 border border-border/50 p-4 text-center">
              <p className="text-xs text-muted mb-1.5">{t('auth.yourCode')}</p>
              <p id="verify-code" className="text-2xl font-bold tracking-[0.2em] text-text tabular-nums select-all">{code}</p>
            </div>
            <div className="flex items-center text-muted" aria-hidden="true">
              <ArrowRight size={16} />
            </div>
            <div className="flex-1 rounded-card bg-surface2 border border-border/50 p-4 text-center">
              <p className="text-xs text-muted mb-1.5">{t('auth.sendTo')}</p>
              <p className="text-2xl font-bold tracking-widest text-text tabular-nums">{shortcode}</p>
            </div>
          </div>

          <ol className="space-y-2 mb-5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-muted">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary-text text-xs font-bold flex items-center justify-center shrink-0 tabular-nums" aria-hidden="true">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          {view === 'PENDING' && (
            <>
              {canSms ? (
                <>
                  <Button href={smsUri} size="lg" className="w-full mb-2">
                    {t('auth.openSms')}
                  </Button>
                  <Button variant="outline" size="lg" className="w-full mb-3" onClick={copyCode}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? t('auth.copiedCode') : t('auth.copyCode')}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" className="w-full mb-2" onClick={copyCode}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? t('auth.copiedCode') : t('auth.copyCode')}
                  </Button>
                  <p className="text-xs text-muted text-center mb-3 leading-relaxed">{t('auth.desktopHint')}</p>
                </>
              )}
              <div className="flex items-center justify-center gap-2 text-sm text-muted" role="status" aria-live="polite">
                <span>{t('auth.waiting')}</span>
                <span className="tabular-nums font-semibold text-text">{mins}:{secs}</span>
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

          <p className="text-xs text-muted text-center mt-5 pt-4 border-t border-border/20 leading-relaxed">
            {t('auth.cost')}
          </p>

          {/* Time remaining as a draining bar — legible at a glance without
              the anxiety of a pulsing dot. */}
          {view === 'PENDING' && (
            <div
              className="absolute bottom-0 left-0 h-1 bg-primary/30"
              style={{ width: `${(secondsLeft / 300) * 100}%`, transition: 'width 1s linear' }}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="text-center mt-4">
          <Link to="/login" className="text-xs text-muted hover:text-text transition-colors">
            {t('auth.back')}
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
