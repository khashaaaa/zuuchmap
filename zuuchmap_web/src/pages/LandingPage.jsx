import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { ShieldCheck } from 'lucide-react'
import { postsApi } from '@/lib/api'
import { getCategoryLabel, getCategoryColor, getCategoryIcon, getThumbUrl, fallbackToFullImage, getPostTitle, formatPriceParts, getLocationLabel, groupThousands, withAlpha, toneForTheme } from '@/lib/utils'
import { trackPageView } from '@/lib/analytics'
import { useThemeStore } from '@/store'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import ErrorState from '@/components/ErrorState'
import Button from '@/components/Button'
import { useCategories } from '@/hooks/useCategories'

/* One line of the price board: what, where, how much. The category colour
   runs down the row's edge, the same mark the category tiles below carry, so
   the board and the tiles read as one inventory. */
function BoardRow({ post, schemas, t, isDark }) {
  const title = getPostTitle(post, t)
  const price = formatPriceParts(post.price_amount, post.price_unit, t)
  const location = getLocationLabel(post, t)
  const color = getCategoryColor(post.category, schemas)
  const Icon = getCategoryIcon(schemas.find((s) => s.key === post.category)?.icon)
  const image = post.images?.[0]
  return (
    <li>
      <Link
        to={`/posts/${post.id}`}
        className="group relative flex items-center gap-3 py-3 pl-4 pr-1 hover:bg-surface2/60 transition-colors rounded-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true" className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ backgroundColor: color || 'var(--color-primary)' }} />
        <span
          className="w-11 h-11 rounded-inset overflow-hidden shrink-0 flex items-center justify-center"
          style={color ? { backgroundColor: withAlpha(color, isDark ? 0.15 : 0.1) } : undefined}
        >
          {image
            ? <img src={getThumbUrl(image)} alt="" loading="lazy" decoding="async" onError={fallbackToFullImage(image)} className="w-full h-full object-cover" />
            : <Icon size={18} aria-hidden="true" style={color ? { color: toneForTheme(color, isDark) } : undefined} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-text line-clamp-2 sm:line-clamp-1 group-hover:text-primary-text transition-colors">{title}</span>
          {location && <span className="text-xs text-muted line-clamp-1 mt-0.5">{location}</span>}
        </span>
        {price && (
          <span className="shrink-0 text-right tabular-nums">
            <span className="block text-sm md:text-base font-extrabold text-text leading-tight">{price.amount}</span>
            {price.unit && <span className="block text-xs text-muted">/{price.unit}</span>}
          </span>
        )}
      </Link>
    </li>
  )
}

/**
 * The front door. A signed-out visitor must be able to see what this
 * marketplace holds before being asked for a phone number — so everything
 * here reads from the public endpoints, and the numbers are real.
 */
export default function LandingPage() {
  const { t } = useTranslation()
  // Defaults are the landing copy; this only pins the canonical to `/`.
  useDocumentMeta({ url: `${window.location.origin}/` })
  const shouldReduceMotion = useReducedMotion()
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme !== 'light'

  const heroItem = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  }

  useEffect(() => { trackPageView('/') }, [])

  const { data: stats, isError: statsError } = useQuery({
    queryKey: ['public-stats'],
    queryFn: postsApi.getStats,
    staleTime: 5 * 60_000,
  })

  const { data: schemas = [], isError: schemasError, isLoading: schemasLoading, refetch: refetchSchemas } = useCategories()

  const { data: recent = [], isLoading: recentLoading, isError: recentError } = useQuery({
    queryKey: ['posts', { approval_status: 'APPROVED', limit: 12 }],
    queryFn: () => postsApi.getAll({ approval_status: 'APPROVED', limit: 12 }),
    select: (d) => (Array.isArray(d) ? d : d?.items ?? []),
    staleTime: 60_000,
  })

  const countFor = (key) =>
    stats?.by_category?.find((c) => c.key === key)?.count ?? 0

  const active = schemas.filter((s) => s.active)

  // The front door is the one page where a silent failure is most expensive: an
  // unreachable engine renders as a marketplace with nothing in it, and a first
  // time visitor has no way to tell that apart from a marketplace nobody uses.
  const loadFailed = (schemasError || statsError || recentError) && !schemasLoading && active.length === 0

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero — the thesis is the stock itself. The headline names what is
          for hire and for sale; beside it, the newest listings with their
          prices, read like a yard's rate board. Real rows, not counters. */}
      <motion.section
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: shouldReduceMotion ? 0 : 0.08 } } }}
        className="max-w-6xl mx-auto px-4 pt-12 pb-14 md:pt-20 md:pb-20 grid gap-10 lg:grid-cols-12 lg:gap-12 lg:items-center"
      >
        <div className="lg:col-span-6">
          <motion.h1 variants={heroItem} className="font-extrabold text-text tracking-tight leading-[1.05] text-[clamp(2.25rem,5vw,3.5rem)] text-balance">
            {t('landing.heroTitle')}
          </motion.h1>
          <motion.p variants={heroItem} className="max-w-xl mt-6 text-base md:text-lg text-muted leading-relaxed">
            {t('landing.heroLead')}
          </motion.p>
          <motion.div variants={heroItem} className="flex flex-wrap gap-3 mt-8">
            <Button to="/browse" size="lg">{t('landing.ctaBrowse')}</Button>
            <Button to="/login" size="lg" variant="outline">{t('landing.ctaPost')}</Button>
          </motion.div>
        </div>

        <motion.div variants={heroItem} className="lg:col-span-6">
          <div className="rounded-card bg-surface border border-border/20 shadow-card p-2 md:p-3">
            <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
                <span className="w-2 h-2 rounded-full bg-success" aria-hidden="true" />
                {t('landing.boardTitle')}
              </h2>
              <Link to="/browse" className="py-2.5 -my-2.5 text-sm text-primary-text hover:underline">
                {t('common.viewAll')}
              </Link>
            </div>
            {recentLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 skeleton rounded-inset" />)}
              </div>
            ) : (
              <ul className="divide-y divide-border/15">
                {recent.slice(0, 6).map((post) => (
                  <BoardRow key={post.id} post={post} schemas={schemas} t={t} isDark={isDark} />
                ))}
              </ul>
            )}
            {/* The line is always laid out — appearing when the counts landed, it
                grew the board and, with the hero row centred, shifted the whole
                fold (CLS 0.11 on desktop). */}
            <p className="px-2 pt-3 pb-1 border-t border-border/15 text-xs text-muted tabular-nums">
              {typeof stats?.total === 'number'
                ? t('landing.boardSummary', { posts: groupThousands(stats.total), provinces: stats.provinces ?? 0 })
                : '\u00a0'}
            </p>
          </div>
        </motion.div>
      </motion.section>

      {/* The inventory by kind. Every tile is real supply. */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <h2 className="text-xl md:text-2xl font-bold text-text tracking-tight mb-5">
          {t('landing.categoriesTitle')}
        </h2>
        {loadFailed && <ErrorState onRetry={refetchSchemas} />}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {schemasLoading && Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="min-h-[7.5rem] skeleton rounded-card" />
          ))}
          {active.map((schema) => {
            const catColor = getCategoryColor(schema.key, schemas)
            const Icon = getCategoryIcon(schema.icon)
            const tone = catColor ? toneForTheme(catColor, isDark) : undefined
            return (
              <Link
                key={schema.key}
                to={`/browse?category=${schema.key}`}
                style={catColor ? { '--cat': catColor, backgroundColor: withAlpha(catColor, isDark ? 0.1 : 0.07) } : undefined}
                className="cat-tile group relative flex flex-col justify-between min-h-[7.5rem] p-4 pl-5 rounded-card bg-surface border border-border/20 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full"
                  style={{ backgroundColor: catColor || 'var(--color-primary)' }}
                />
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-text leading-snug">
                    {getCategoryLabel(schema.key, t, schemas)}
                  </span>
                  <Icon size={18} className="shrink-0 mt-0.5" style={tone ? { color: tone } : undefined} aria-hidden="true" />
                </span>
                <span className="mt-3 text-2xl font-bold text-text tabular-nums">
                  {groupThousands(countFor(schema.key))}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="border-t border-border/20 bg-surface/40">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-bold text-text tracking-tight mb-6">
            {t('landing.howTitle')}
          </h2>
          {/* Two audiences side by side, not steps — so no 01/02. Each path
              ends in the action it describes. */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-12">
            <div>
              <h3 className="font-semibold text-text mb-2">{t('landing.howCustomer')}</h3>
              <p className="text-sm text-muted leading-relaxed">{t('landing.howCustomerBody')}</p>
              <Link to="/browse" className="inline-block mt-3 py-2 text-sm font-semibold text-primary-text hover:underline">{t('landing.ctaBrowse')}</Link>
            </div>
            <div>
              <h3 className="font-semibold text-text mb-2">{t('landing.howProvider')}</h3>
              <p className="text-sm text-muted leading-relaxed">{t('landing.howProviderBody')}</p>
              <Link to="/login" className="inline-block mt-3 py-2 text-sm font-semibold text-primary-text hover:underline">{t('landing.ctaPost')}</Link>
            </div>
          </div>

          {/* The trust claim is the argument for using this over a Facebook
              group — it gets its own panel, not a footnote. */}
          <div className="mt-10 max-w-2xl rounded-card border border-border/20 bg-surface p-5 flex items-start gap-4">
            <span className="w-9 h-9 rounded-inset bg-success/10 text-success flex items-center justify-center shrink-0" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h3 className="text-lg md:text-xl font-semibold text-text mb-1">{t('landing.trustTitle')}</h3>
              <p className="text-sm text-muted leading-relaxed">{t('landing.trustBody')}</p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
