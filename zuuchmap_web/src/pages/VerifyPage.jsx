import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/lib/api'
import { useAuthStore as useStore } from '@/store'
import { toast } from 'sonner'

export default function VerifyPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const phone = params.get('phone') ?? ''
  const hint = params.get('hint') ?? ''
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const refs = useRef([])
  const navigate = useNavigate()
  const login = useStore((s) => s.login)

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  function handleChange(i, val) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...code]
    next[i] = digit
    setCode(next)
    if (digit && i < 5) refs.current[i + 1]?.focus()
    if (next.every(Boolean)) submit(next.join(''))
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !code[i] && i > 0) refs.current[i - 1]?.focus()
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) { setCode(pasted.split('')); submit(pasted) }
  }

  async function submit(otp) {
    setLoading(true)
    try {
      const { token, user } = await authApi.verifyOtp(phone, otp)
      login(token, user)
      if (!user.type) return navigate('/onboarding')
      if (user.is_admin) navigate('/admin')
      else if (user.type === 'PROVIDER') navigate('/provider')
      else navigate('/customer')
    } catch {
      toast.error(t('auth.wrongCode'))
      setCode(['', '', '', '', '', ''])
      refs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    try {
      const res = await authApi.sendOtp(phone)
      const newHint = res.code
      setCountdown(60)
      toast.success(t('auth.resent'))
      if (newHint) toast.info(t('auth.otpHint', { code: newHint }), { duration: 10000 })
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm"
      >
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <h2 className="font-semibold text-text mb-1">{t('auth.verifyTitle')}</h2>
          <p className="text-sm text-muted mb-4">{t('auth.verifySubtitle', { phone })}</p>
          {hint && (
            <div className="mb-4 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-mono text-center">
              {t('auth.otpHint', { code: hint })}
            </div>
          )}
          <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (refs.current[i] = el)}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-11 h-12 text-center text-lg font-bold bg-surface2 border border-border/50 rounded-btn text-text outline-none focus:border-primary/60 transition-colors"
              />
            ))}
          </div>
          {loading && <p className="text-center text-sm text-muted mb-4">{t('auth.verifying')}</p>}
          <div className="text-center">
            {countdown > 0 ? (
              <p className="text-xs text-muted">{t('auth.resendIn', { count: countdown })}</p>
            ) : (
              <button onClick={resend} className="text-xs text-primary hover:underline">{t('auth.resend')}</button>
            )}
          </div>
        </div>
        <button onClick={() => navigate('/login')} className="mt-4 text-xs text-muted w-full text-center hover:text-text transition-colors">
          {t('auth.back')}
        </button>
      </motion.div>
    </div>
  )
}
