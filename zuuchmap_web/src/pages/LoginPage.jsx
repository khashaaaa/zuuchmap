import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { authApi, postsApi } from '@/lib/api'
import { getDeviceId } from '@/lib/device'
import { track } from '@/lib/analytics'
import { useAuthStore as useStore, useThemeStore } from '@/store'
import { useCategories } from '@/hooks/useCategories'
import { toast } from 'sonner'
import Button from '@/components/Button'
import Input from '@/components/Input'
import { apiErrorMessage, getCategoryColor, getCategoryIcon, toneForTheme, withAlpha, groupThousands } from '@/lib/utils'

/**
 * Every live category as a tile, laid in brick bond — courses alternate short
 * and long so each sits offset by half a tile (13 categories lay 4/5/4). The
 * app's sign-in screen draws the same wall. Decorative: the labels live on the
 * landing page's category board, one link away.
 */
function CategoryWall({ schemas, isDark, reduceMotion }) {
  const active = schemas
    .filter((s) => s.active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const rows = []
  for (let i = 0, r = 0; i < active.length && r < 3; r++) {
    const n = r % 2 === 0 ? 4 : 5
    rows.push(active.slice(i, i + n))
    i += n
  }
  return (
    <div aria-hidden="true" className="flex flex-col items-center gap-2.5 mb-8">
      {rows.map((row, r) => (
        <div key={r} className="flex gap-2.5">
          {row.map((schema, i) => {
            const color = getCategoryColor(schema.key, schemas)
            const Icon = getCategoryIcon(schema.icon)
            return (
              <motion.span
                key={schema.key}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: (r * 5 + i) * 0.035 }}
                className="size-12 rounded-xl flex items-center justify-center"
                style={color ? { backgroundColor: withAlpha(color, isDark ? 0.22 : 0.14) } : undefined}
              >
                <Icon size={22} style={color ? { color: toneForTheme(color, isDark) } : undefined} />
              </motion.span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function LoginPage() {
  const shouldReduceMotion = useReducedMotion()
  const { t } = useTranslation()
  useDocumentMeta({ title: t('auth.title') })
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useStore((s) => s.login)
  // Where the visitor was when they were asked to sign in. Every guest
  // affordance sets this; nothing used to read it, so someone who tapped Save
  // on a listing verified their number and landed on a dashboard, with the
  // listing they had come for nowhere on the screen.
  const { from, reason } = useLocation().state ?? {}
  const isDark = useThemeStore((s) => s.theme) !== 'light'
  const { data: schemas = [] } = useCategories()
  // Garnish: absent until it loads, never in the form's way.
  const { data: stats } = useQuery({
    queryKey: ['public-stats'],
    queryFn: postsApi.getStats,
    staleTime: 5 * 60_000,
  })

  function routeFor(user) {
    if (!user.type) return '/onboarding'
    if (user.is_admin) return '/admin'
    // Onboarding and the admin app are destinations of their own; anything
    // else goes back where the visitor was interrupted.
    if (from) return from
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
      navigate('/verify', { state: { phone, from, ...res }, replace: true })
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
        transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        className="w-full max-w-sm"
      >
        <CategoryWall schemas={schemas} isDark={isDark} reduceMotion={shouldReduceMotion} />
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-2xl font-bold text-text">ZuuchMap</h1>
          </Link>
          <p className="text-sm text-muted mt-1">{t('auth.subtitle')}</p>
          {stats?.total > 0 && (
            <p className="inline-flex items-center gap-2 text-xs text-muted mt-3">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {t('auth.liveStats', { listings: groupThousands(stats.total), provinces: stats.provinces })}
            </p>
          )}
        </div>
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <h2 className="text-sm font-semibold text-text mb-1">{t('auth.title')}</h2>
          {/* Why the visitor is here, when a guest action sent them: the tap
              used to land on a bare sign-in form with nothing connecting it to
              the Save or Book button they had just pressed. */}
          {reason && <p className="text-sm text-text mb-2">{t(reason)}</p>}
          <p className="text-xs text-muted mb-4">{t('auth.startHint')}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="phone" className="field-label">{t('common.phone')}</label>
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
        {/* No middot separators: as their own flex items they get stranded at
            the end of a wrapped line. The four labels are long enough in mn
            that this row always wraps — gap alone carries the separation. */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-6 text-xs text-muted">
          <Link to="/" className="whitespace-nowrap hover:text-text transition-colors">{t('landing.browse')}</Link>
          <Link to="/privacy" className="whitespace-nowrap hover:text-text transition-colors">{t('privacy.title')}</Link>
          <Link to="/terms" className="whitespace-nowrap hover:text-text transition-colors">{t('terms.title')}</Link>
          <Link to="/help" className="whitespace-nowrap hover:text-text transition-colors">{t('helpSupport.title')}</Link>
        </div>
      </motion.div>
    </div>
  )
}
