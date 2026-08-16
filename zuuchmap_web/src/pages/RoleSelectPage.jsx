import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Briefcase, Search } from 'lucide-react'
import { usersApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import { toast } from 'sonner'
import Button from '@/components/Button'

export default function RoleSelectPage() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { user, login, logout, token } = useAuthStore()

  function handleBack() {
    logout()
    navigate('/login')
  }

  async function handleContinue() {
    if (!selected) return
    setLoading(true)
    try {
      const updated = await usersApi.setType(selected, user.phone_number)
      login(token, { ...user, type: updated.type ?? selected })
      navigate(selected === 'PROVIDER' ? '/provider' : '/customer')
    } catch {
      toast.error(t('onboarding.error'))
    } finally {
      setLoading(false)
    }
  }

  const options = [
    { type: 'PROVIDER', icon: Briefcase, label: t('onboarding.provider'), desc: t('onboarding.providerDesc') },
    { type: 'CUSTOMER', icon: Search, label: t('onboarding.customer'), desc: t('onboarding.customerDesc') },
  ]

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
          <h1 className="text-2xl font-bold text-text">{t('onboarding.title')}</h1>
          <p className="text-sm text-muted mt-1">{t('onboarding.subtitle')}</p>
        </div>
        <div className="space-y-3 mb-6">
          {options.map(({ type, icon: Icon, label, desc }) => (
            <button
              key={type}
              onClick={() => setSelected(type)}
              className={`w-full flex items-center gap-4 p-4 rounded-card border-2 transition-all text-left ${
                selected === type
                  ? 'border-primary bg-primary/10'
                  : 'border-border/50 bg-surface hover:border-primary/40'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected === type ? 'bg-primary text-on-primary' : 'bg-surface2 text-muted'}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="font-semibold text-text text-sm">{label}</p>
                <p className="text-xs text-muted mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>
        <Button onClick={handleContinue} size="lg" disabled={!selected || loading} className="w-full">
          {loading ? t('onboarding.saving') : t('onboarding.continue')}
        </Button>
        <button onClick={handleBack} className="mt-4 text-xs text-muted w-full text-center hover:text-text transition-colors">
          {t('auth.back')}
        </button>
      </motion.div>
    </div>
  )
}
