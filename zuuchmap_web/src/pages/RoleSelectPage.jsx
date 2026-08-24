import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Truck, Search } from 'lucide-react'
import { usersApi, categoryApi } from '@/lib/api'
import { useAuthStore, useThemeStore } from '@/store'
import { CATEGORY_COLORS, withAlpha, toneForTheme } from '@/lib/utils'
import { toast } from 'sonner'
import Button from '@/components/Button'
import Logo from '@/components/Logo'

export default function RoleSelectPage() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { user, login, logout, token } = useAuthStore()
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme !== 'light'

  // The count was baked into the copy as "13". Categories are admin-editable
  // without a deploy, so the sentence went stale the moment one was added.
  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 5 * 60_000,
  })
  const categoryCount = schemas.filter((c) => c.active).length

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

  // Each side of the fork borrows a hue from the category family it leads to —
  // machinery green for the people who own it, construction teal for the
  // people who need it. Selection stays amber: chosen is the only amber thing.
  const options = [
    { type: 'PROVIDER', icon: Truck, hue: CATEGORY_COLORS.vehiclerent, label: t('onboarding.provider'), desc: t('onboarding.providerDesc'), hint: t('onboarding.providerHint') },
    { type: 'CUSTOMER', icon: Search, hue: CATEGORY_COLORS.construction, label: t('onboarding.customer'), desc: t('onboarding.customerDesc'), hint: t('onboarding.customerHint', { count: categoryCount }) },
  ]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-8">
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text">{t('onboarding.title')}</h1>
          <p className="text-sm text-muted mt-1">{t('onboarding.subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mb-6">
          {options.map(({ type, icon: Icon, hue, label, desc, hint }) => {
            const isSelected = selected === type
            return (
              <button
                key={type}
                onClick={() => setSelected(type)}
                aria-pressed={isSelected}
                className={`w-full flex flex-col items-start gap-3 p-5 rounded-card border-2 transition-all text-left ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border/50 hover:border-primary/40'
                }`}
                style={!isSelected ? { backgroundColor: withAlpha(hue, isDark ? 0.08 : 0.05) } : undefined}
              >
                <span
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary text-on-primary' : ''}`}
                  style={!isSelected ? { backgroundColor: withAlpha(hue, 0.15), color: toneForTheme(hue, isDark) } : undefined}
                >
                  <Icon size={20} />
                </span>
                <span>
                  <span className="block text-base font-bold text-text">{label}</span>
                  <span className="block text-xs text-muted mt-0.5">{desc}</span>
                  <span className="block text-xs text-text/80 mt-2 leading-relaxed">{hint}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="max-w-sm mx-auto">
          <Button onClick={handleContinue} size="lg" disabled={!selected || loading} className="w-full">
            {loading ? t('onboarding.saving') : t('onboarding.continue')}
          </Button>
          <button onClick={handleBack} className="mt-4 text-xs text-muted w-full text-center hover:text-text transition-colors">
            {t('auth.back')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
