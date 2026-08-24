import { memo } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { categoryApi } from '../lib/api'
import { getImageUrl, getPostTitle, getPostCategory, getCategoryLabel, getCategoryColor, toneForTheme, withAlpha, formatPrice, formatDate } from '../lib/utils'
import { useThemeStore } from '../store'
import CategoryBadge from './CategoryBadge'
import StatusBadge from './StatusBadge'
import AvailabilityStrip from './AvailabilityStrip'
import { hideBrokenImage, getLocationLabel } from '@/lib/utils'

function PostCard({ post, actions, to, index = 0 }) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const img = post.images?.[0]
  const title = getPostTitle(post, t)
  const price = formatPrice(post.price_amount, post.price_unit, t)
  const location = getLocationLabel(post, t)

  // Emphasis is an admin-set schema flag (CategorySchema.emphasized) — no
  // hardcoded category keys. Same key/staleTime as every other consumer, so
  // this reads the shared cache rather than refetching per card.
  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 5 * 60_000,
  })
  const category = getPostCategory(post)
  const cardSchema = schemas.find((s) => s.key === category)
  const emphasized = !!cardSchema?.emphasized
  // Availability is a rental concern: the engine only sends busy_dates for
  // has_rental_status categories, and the strip only means something there.
  const showAvailability = !!cardSchema?.has_rental_status && Array.isArray(post.busy_dates)
  // Paid placement. Server-decided — the card only renders what it is told.
  const featured = !!post.featured_until && new Date(post.featured_until) > new Date()

  // Photo-less posts get a quiet category-tinted ground instead of a flat grey
  // slab — same colour discipline as CategoryBadge (fill from the stored hex,
  // text re-lit for the active theme).
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme !== 'light'
  const catBase = getCategoryColor(category, schemas)

  return (
    <motion.div
      layout={!shouldReduceMotion}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut', delay: shouldReduceMotion ? 0 : Math.min(index, 10) * 0.03 },
      }}
      whileHover={shouldReduceMotion ? undefined : { y: -3 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
      className={`group bg-surface border ${emphasized ? 'border-danger/50' : 'border-border/20'} shadow-card hover:shadow-card-hover transition-shadow duration-200 rounded-card overflow-hidden flex flex-col`}
    >
      <Link to={to ?? `/posts/${post.id}`} className="block">
        <div className="relative h-44 bg-surface2 overflow-hidden">
          {img ? (
            <img
              src={getImageUrl(img)}
              alt={title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" onError={hideBrokenImage} />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-sm"
              style={catBase ? { backgroundColor: withAlpha(catBase, isDark ? 0.14 : 0.1), color: toneForTheme(catBase, isDark) } : undefined}
            >
              <span className={catBase ? 'opacity-80' : 'text-muted'}>{t('posts.noImage')}</span>
            </div>
          )}
          {/* Approved is the norm on every public/customer card — only surface
              the exceptional states (pending/rejected) that a provider acts on. */}
          {post.approval_status && post.approval_status !== 'APPROVED' && (
            <div className="absolute top-2 right-2">
              <StatusBadge status={post.approval_status} />
            </div>
          )}
          {/* Paid placement marker. Sits top-LEFT because top-right is the
              StatusBadge slot. Bounded width — the label is translated. */}
          {featured && (
            <span className="absolute top-2 left-2 max-w-[70%] truncate px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary text-on-primary">
              {t('admin.featured')}
            </span>
          )}
          {/* Attention strip for emphasized categories — mirrors the app's
              CustomerPostList badge (danger fill, caps label over the photo). */}
          {emphasized && (
            <div className="absolute inset-x-0 bottom-0 bg-danger px-2 py-0.5 text-center">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-on-color truncate">
                {getCategoryLabel(category, t, schemas)}
              </span>
            </div>
          )}
        </div>
        <div className="p-3.5">
          <CategoryBadge category={getPostCategory(post)} />
          <p className="text-sm md:text-base font-semibold text-text mt-2 line-clamp-2 leading-tight">{title}</p>
          {price && <p className="text-primary-text font-bold text-sm md:text-base mt-1 tabular-nums">{price}</p>}
          <div className="flex flex-wrap items-center justify-between mt-2">
            {location && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <MapPin size={11} /> {location}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-muted ml-auto tabular-nums">
              <Eye size={11} /> {post.views ?? 0}
            </span>
          </div>
          <p className="text-xs text-muted mt-1">{formatDate(post.date_created)}</p>
          {showAvailability && <AvailabilityStrip busyDates={post.busy_dates} className="mt-2.5" />}
        </div>
      </Link>
      {actions && <div className="px-3.5 pb-3.5 mt-2.5">{actions}</div>}
    </motion.div>
  )
}

export default memo(PostCard)
