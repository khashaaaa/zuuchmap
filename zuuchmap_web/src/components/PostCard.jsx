import { memo } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, Eye } from 'lucide-react'
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
      className={`group bg-surface border ${emphasized ? 'border-primary/50 bg-primary/5' : 'border-border/20'} shadow-card hover:shadow-card-hover transition-shadow duration-200 rounded-card overflow-hidden flex flex-col`}
    >
      {/* `@max-md:` is the grid's own width (PostGrid is the container), so it
          is true exactly when the grid has collapsed to one column — a phone.
          There the card lies down: a stacked 4:3 photo made each listing ~500px
          tall, one and a half to a screen across a list of ninety. Outside a
          container (the carousels) nothing matches and the card stays stacked. */}
      <Link to={to ?? `/posts/${post.id}`} className="block @max-md:flex">
        <div className="relative aspect-[4/3] @max-md:aspect-auto @max-md:w-28 @max-md:shrink-0 bg-surface2 overflow-hidden">
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
          {/* Approved and live is the norm on every public/customer card — only
              surface the exceptional states. Moderation first (pending/rejected,
              what a provider acts on), then a lapsed window: browse filters
              EXPIRED out, so the saved list is the one place a customer meets a
              listing that is no longer on the market, and it used to look
              identical to a live one. RENTED does stay in browse — it is still
              bookable for later dates — and the app marks it, so browse here
              must too or the two clients show the same row differently. */}
          {/* On an opaque ground of its own: the badge's fill is a 10% tint
              meant for a surface, and straight over a photo "Дууссан" was red
              on teal at no contrast at all. Moves into the text column when
              the card lies down — it is wider than that thumbnail. */}
          {badgeStatus && (
            <div className="absolute top-2 right-2 rounded-md bg-surface @max-md:hidden">
              <StatusBadge status={badgeStatus} />
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
        <div className="p-3.5 @max-md:p-3 @max-md:flex-1 @max-md:min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={getPostCategory(post)} />
            {badgeStatus && <span className="hidden @max-md:inline-flex"><StatusBadge status={badgeStatus} /></span>}
          </div>
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
