import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { postsApi, categoryApi } from '@/lib/api'
import { getCategoryLabel, getCategoryColor, getCategoryIcon, getImageUrl, getPostTitle, formatPrice, withAlpha, toneForTheme, hideBrokenImage } from '@/lib/utils'
import { trackPageView } from '@/lib/analytics'
import { useThemeStore } from '@/store'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import PostCard from '@/components/PostCard'
import ErrorState from '@/components/ErrorState'
import Button from '@/components/Button'
import { CountUp } from '@/components/StatCard'

/* Film-strip tile for the showcase ribbon: the photo is the card, title and
   price sit on a scrim (onMedia idiom — white on photography in both themes).
   The ribbon's duplicate group passes tabbable={false} so keyboard users only
   meet each listing once. */
function RibbonCard({ post, t, tabbable = true }) {
  const title = getPostTitle(post, t)
  const price = formatPrice(post.price_amount, post.price_unit, t)
  // bg-surface2 so a photo that 404s leaves a card, not a hole: hideBrokenImage
  // only hides the <img>, and the scrim on top of it stays either way.
  return (
    <Link
      to={`/posts/${post.id}`}
      tabIndex={tabbable ? undefined : -1}
      className="group relative block w-64 h-44 rounded-card overflow-hidden bg-surface2 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <img
        src={getImageUrl(post.images[0])}
        alt={title}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" onError={hideBrokenImage} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-sm font-semibold text-white line-clamp-1">{title}</p>
        {price && <p className="text-xs font-bold text-primary mt-0.5 tabular-nums">{price}</p>}
      </div>
    </Link>
  )
}

/**
 * The front door. A signed-out visitor must be able to see what this
 * marketplace holds before being asked for a phone number — so everything
 * here reads from the public endpoints, and the numbers are real.
 */
export default function LandingPage() {
  const { t } = useTranslation()
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

  const { data: schemas = [], isError: schemasError, isLoading: schemasLoading, refetch: refetchSchemas } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 5 * 60_000,
  })

  const { data: recent = [], isLoading: recentLoading, isError: recentError } = useQuery({
    queryKey: ['posts', { approval_status: 'APPROVED', limit: 12 }],
    queryFn: () => postsApi.getAll({ approval_status: 'APPROVED', limit: 12 }),
    select: (d) => (Array.isArray(d) ? d : d?.items ?? []),
    staleTime: 60_000,
  })

  // The ribbon is a film-strip, so it only holds listings that bring a photo;
  // with too few it can't loop convincingly and the static grid reads better.
  const withImages = recent.filter((p) => p.images?.length)
  const showRibbon = !shouldReduceMotion && withImages.length >= 4

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

      {/* Hero — the thesis: breadth. */}
      <motion.section
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: shouldReduceMotion ? 0 : 0.08 } } }}
        className="relative isolate max-w-6xl mx-auto px-4 pt-14 pb-10 md:pt-20 md:pb-14"
      >
        <div className="hero-ambient" aria-hidden="true" />
        <motion.h1 variants={heroItem} className="max-w-3xl font-extrabold text-text tracking-tight leading-[1.05] text-[clamp(2.25rem,6vw,4rem)]">
          {t('landing.heroTitle')}
        </motion.h1>
        <motion.p variants={heroItem} className="max-w-2xl mt-5 text-base md:text-lg text-muted leading-relaxed">
          {t('landing.heroLead')}
        </motion.p>

        <motion.div variants={heroItem} className="flex flex-wrap gap-3 mt-8">
          <Button to="/browse" size="lg">{t('landing.ctaBrowse')}</Button>
          <Button to="/login" size="lg" variant="outline">{t('landing.ctaPost')}</Button>
        </motion.div>

        <motion.dl variants={heroItem} className="flex flex-wrap gap-x-10 gap-y-4 mt-10 pt-8 border-t border-border/20">
          {[
            { value: stats?.total, label: t('landing.statsPosts') },
            { value: active.length || null, label: t('landing.statsCategories') },
            { value: stats?.provinces, label: t('landing.statsProvinces') },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="sr-only">{stat.label}</dt>
              <dd className="text-2xl md:text-3xl font-bold text-text tabular-nums">
                {typeof stat.value === 'number' ? <CountUp value={stat.value} /> : '—'}
              </dd>
              <p className="text-xs text-muted mt-0.5" aria-hidden="true">{stat.label}</p>
            </div>
          ))}
        </motion.dl>
      </motion.section>

      {/* Signature: the live inventory board. Every tile is real supply. */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          {t('landing.categoriesTitle')}
        </h2>
        {loadFailed && <ErrorState onRetry={refetchSchemas} />}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                  <CountUp value={countFor(schema.key)} />
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Real listings, visible without an account. Skeleton tiles hold the
          section's height while loading so the footer doesn't jump. */}
      {(recentLoading || recent.length > 0) && (
        <section className="max-w-6xl mx-auto px-4 pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
              {t('posts.recentPosts')}
            </h2>
            <Link to="/browse" className="text-sm text-primary-text hover:underline">
              {t('common.viewAll')}
            </Link>
          </div>
          {recentLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-64 skeleton rounded-card" />
              ))}
            </div>
          ) : showRibbon ? (
            <div className="marquee" style={{ '--marquee-dur': `${withImages.length * 6}s` }}>
              <div className="marquee-track">
                <div className="marquee-group">
                  {withImages.map((post) => <RibbonCard key={post.id} post={post} t={t} />)}
                </div>
                <div className="marquee-group" aria-hidden="true">
                  {withImages.map((post) => <RibbonCard key={`dup-${post.id}`} post={post} t={t} tabbable={false} />)}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {recent.slice(0, 8).map((post, i) => <PostCard key={post.id} post={post} index={i} />)}
            </div>
          )}
        </section>
      )}

      <section className="border-t border-border/20 bg-surface/40">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-6">
            {t('landing.howTitle')}
          </h2>
          {/* The two paths are a real sequence for each visitor — numbering
              earns its place here. */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex gap-4">
              <span className="text-sm font-bold text-primary-text tabular-nums leading-6" aria-hidden="true">01</span>
              <div>
                <h3 className="font-semibold text-text mb-2">{t('landing.howCustomer')}</h3>
                <p className="text-sm text-muted leading-relaxed">{t('landing.howCustomerBody')}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="text-sm font-bold text-primary-text tabular-nums leading-6" aria-hidden="true">02</span>
              <div>
                <h3 className="font-semibold text-text mb-2">{t('landing.howProvider')}</h3>
                <p className="text-sm text-muted leading-relaxed">{t('landing.howProviderBody')}</p>
              </div>
            </div>
          </div>

          {/* The trust claim is the argument for using this over a Facebook
              group — it gets its own panel, not a footnote. */}
          <div className="mt-10 max-w-2xl rounded-card border border-border/20 bg-surface p-5 flex items-start gap-4">
            <span className="w-9 h-9 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0" aria-hidden="true">
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
