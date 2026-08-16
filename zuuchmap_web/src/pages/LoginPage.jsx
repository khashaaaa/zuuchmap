import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/lib/api'
import { toast } from 'sonner'
import Button from '@/components/Button'

export default function LoginPage() {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (phone.length !== 8) return toast.error(t('auth.phoneError'))
    setLoading(true)
    try {
      const res = await authApi.sendOtp(phone)
      const hint = res.code // present in dev mode from engine
      navigate(`/verify?phone=${phone}${hint ? `&hint=${hint}` : ''}`)
    } catch {
      toast.error(t('auth.sendError'))
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
          <div className="w-14 h-14 rounded-card bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🏗️</span>
          </div>
          <h1 className="text-2xl font-bold text-text">ZuuchMap</h1>
          <p className="text-sm text-muted mt-1">{t('auth.subtitle')}</p>
        </div>
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <h2 className="font-semibold text-text mb-4">{t('auth.title')}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-muted block mb-1.5">{t('common.phone')}</label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 bg-surface2 border border-border/50 rounded-btn text-sm text-muted">
                  {t('auth.phoneLabel')}
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={8}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('auth.phonePlaceholder')}
                  className="flex-1 bg-surface2 border border-border/50 rounded-btn px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-primary/60 transition-colors"
                />
              </div>
            </div>
            <Button type="submit" size="lg" disabled={loading || phone.length !== 8} className="w-full">
              {loading ? t('auth.sending') : t('auth.sendOtp')}
            </Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-6 text-xs text-muted">
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
