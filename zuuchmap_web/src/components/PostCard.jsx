import { memo } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, Eye, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getImageUrl, getPostTitle, getPostCategory, getCategoryLabel, getCategoryColor, toneForTheme, withAlpha, formatPrice, formatDate } from '../lib/utils'
import { useThemeStore } from '../store'
import CategoryBadge from './CategoryBadge'
import StatusBadge from './StatusBadge'
import AvailabilityStrip from './AvailabilityStrip'
import { getThumbUrl, fallbackToFullImage, getLocationLabel } from '@/lib/utils'
import { useCategories } from '@/hooks/useCategories'

function PostCard({ post, actions, to }) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const img = post.images?.[0]
  const title = getPostTitle(post, t)
  const price = formatPrice(post.price_amount, post.price_unit, t)
  const location = getLocationLabel(post, t)

  // Emphasis is an admin-set schema flag (CategorySchema.emphasized) — no
  // hardcoded category keys. Same key/staleTime as every other consumer, so
  // this reads the shared cache rather than refetching per card.
  const { data: schemas = [] } = useCategories()
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
  // Only the exceptional states are badged — see the note at the render site.
  const badgeStatus = post.approval_status && post.approval_status !== 'APPROVED'
    ? post.approval_status
    : (post.status === 'EXPIRED' || post.status === 'RENTED') ? post.status : null

  return (
    <motion.div
      whileHover={shouldReduceMotion ? undefined : { y: -3 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
      className={`group relative bg-surface border ${emphasized ? 'border-primary/50 bg-primary/5' : 'border-border/20'} shadow-card hover:shadow-card-hover transition-shadow duration-200 rounded-card overflow-hidden flex flex-col`}
    >
      {/* `@max-md:` is the grid's own width (PostGrid is the container), so it
          is true exactly when the grid has collapsed to one column — a phone.
          There the card lies down: a stacked 4:3 photo made each listing ~500px
          tall, one and a half to a screen across a list of ninety. Outside a
          container (the carousels) nothing matches and the card stays stacked. */}
      <Link to={to ?? `/posts/${post.id}`} className="block @max-md:flex @max-md:gap-3 @max-md:p-2.5">
        <div className="relative aspect-[4/3] @max-md:aspect-square @max-md:w-24 @max-md:self-start @max-md:shrink-0 @max-md:rounded-inset bg-surface2 overflow-hidden">
          {img ? (
            <img
              src={getThumbUrl(img)}
              alt={title}
              loading="lazy"
              decoding="async"
              className="w-full h-full @max-md:absolute @max-md:inset-0 object-cover object-[center_40%] transition-transform duration-300 group-hover:scale-[1.04]" onError={fallbackToFullImage(img)} />
          ) : (
            <div
              className="w-full h-full @max-md:absolute @max-md:inset-0 flex items-center justify-center text-center px-1 text-sm @max-md:text-xs"
              style={catBase ? { backgroundColor: withAlpha(catBase, isDark ? 0.14 : 0.1), color: toneForTheme(catBase, isDark) } : undefined}
            >
              <span className={catBase ? 'opacity-80' : 'text-muted'}>{t('posts.noImage')}</span>
            </div>
          )}
          {/* Paid placement marker, top-left — top-right is the actions slot.
              A labelled chip where the photo is wide, the app's star where it
              is a thumbnail. */}
          {featured && (
            <span title={t('admin.featured')} className="absolute top-2 left-2 @max-md:top-1.5 @max-md:left-1.5 max-w-[70%] truncate inline-flex items-center gap-1 px-2 py-0.5 @max-md:p-1 rounded-md @max-md:rounded-full text-xs font-semibold bg-primary text-on-primary">
              <Star size={11} fill="currentColor" className="shrink-0" />
              <span className="@max-md:sr-only">{t('admin.featured')}</span>
            </span>
          )}
          {/* Attention strip for emphasized categories — mirrors the app's
              CustomerPostList badge (danger fill, caps label over the photo). */}
          {emphasized && (
            <div className="absolute inset-x-0 bottom-0 bg-danger px-2 py-0.5 text-center">
              <span className="block text-overline font-semibold uppercase tracking-wider text-on-color truncate">
                {getCategoryLabel(category, t, schemas)}
              </span>
            </div>
          )}
        </div>
        <div className="p-3.5 @max-md:p-0 @max-md:py-0.5 @max-md:flex-1 @max-md:min-w-0">
          {/* Approved and live is the norm on every public/customer card — only
              surface the exceptional states. Moderation first (pending/rejected,
              what a provider acts on), then a lapsed window: browse filters
              EXPIRED out, so the saved list is the one place a customer meets a
              listing that is no longer on the market. RENTED does stay in
              browse — it is still bookable for later dates — and the app marks
              it, so browse here must too. Beside the category rather than on
              the photo: the photo's corner holds the actions. */}
          <div className={`flex flex-wrap items-center gap-1.5 ${actions ? '@max-md:pr-9' : ''}`}>
            <CategoryBadge category={category} />
            {badgeStatus && <StatusBadge status={badgeStatus} />}
          </div>
          <p className="text-sm md:text-base font-semibold text-text mt-2 @max-md:mt-1.5 line-clamp-2 leading-snug">{title}</p>
          {price && <p className="text-primary-text font-bold text-base md:text-lg mt-1 tabular-nums">{price}</p>}
          <div className="flex items-center gap-2 mt-2 text-xs text-muted">
            {location && (
              <span className="flex items-center gap-1 min-w-0">
                <MapPin size={11} className="shrink-0" /> <span className="truncate">{location}</span>
              </span>
            )}
            <span className="flex items-center gap-2 ml-auto shrink-0 tabular-nums">
              <span>{formatDate(post.date_created)}</span>
              <span className="flex items-center gap-1"><Eye size={11} /> {post.views ?? 0}</span>
            </span>
          </div>
          {showAvailability && <AvailabilityStrip busyDates={post.busy_dates} className="mt-2.5 pt-2.5 border-t border-border/20" />}
        </div>
      </Link>
      {/* The card's top-right corner: over the photo when stacked, over the
          text column when the card lies down. Outside the Link, so a press
          never navigates. */}
      {actions && <div className="absolute top-2 right-2 @max-md:top-2 @max-md:right-2 z-10">{actions}</div>}
    </motion.div>
  )
}

export default memo(PostCard)
