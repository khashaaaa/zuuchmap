import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/lib/api'
import { getDeviceId } from '@/lib/device'
import { track } from '@/lib/analytics'
import { useAuthStore as useStore } from '@/store'
import { toast } from 'sonner'
import Button from '@/components/Button'
import Input from '@/components/Input'
import { apiErrorMessage } from '@/lib/utils'

export default function LoginPage() {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useStore((s) => s.login)

  function routeFor(user) {
    if (!user.type) return '/onboarding'
    if (user.is_admin) return '/admin'
    return user.type === 'PROVIDER' ? '/provider' : '/customer'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (phone.length !== 8) return toast.error(t('auth.phoneError'))
    setLoading(true)
    track('auth.start')
    try {
      const res = await authApi.start(phone, getDeviceId())

      // Device already verified on a previous session — straight in, no SMS.
      if (res.verified && res.auth) {
        login(res.auth.token, res.auth.user)
        track('auth.verified', { trusted_device: true })
        return navigate(routeFor(res.auth.user), { replace: true })
      }

      // Session details travel in router state, never the URL — a phone number
      // in the query string leaks into history, logs and referrer headers.
      navigate('/verify', { state: { phone, ...res }, replace: true })
    } catch (err) {
      toast.error(apiErrorMessage(err, t, t('auth.sendError')))
    } finally {
      setLoading(false)
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
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center">
            <div className="w-14 h-14 rounded-card bg-primary/15 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🏗️</span>
            </div>
            <h1 className="text-2xl font-bold text-text">ZuuchMap</h1>
          </Link>
          <p className="text-sm text-muted mt-1">{t('auth.subtitle')}</p>
        </div>
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <h2 className="text-sm font-semibold text-text mb-1">{t('auth.title')}</h2>
          <p className="text-xs text-muted mb-4">{t('auth.startHint')}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="phone" className="text-xs text-muted block mb-1.5">{t('common.phone')}</label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 bg-surface2 rounded-btn text-sm text-muted">
                  {t('auth.phoneLabel')}
                </span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={8}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('auth.phonePlaceholder')}
                  className="flex-1"
                />
              </div>
            </div>
            <Button type="submit" size="lg" disabled={loading || phone.length !== 8} className="w-full">
              {loading ? t('auth.starting') : t('auth.continue')}
            </Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-6 text-xs text-muted">
          <Link to="/" className="whitespace-nowrap hover:text-text transition-colors">{t('landing.browse')}</Link>
          <span>·</span>
          <Link to="/privacy" className="whitespace-nowrap hover:text-text transition-colors">{t('privacy.title')}</Link>
          <span>·</span>
          <Link to="/terms" className="whitespace-nowrap hover:text-text transition-colors">{t('terms.title')}</Link>
          <span>·</span>
          <Link to="/help" className="whitespace-nowrap hover:text-text transition-colors">{t('helpSupport.title')}</Link>
        </div>
      </motion.div>
    </div>
  )
}
