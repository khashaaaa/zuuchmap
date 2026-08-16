import { memo } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getImageUrl, getPostTitle, getPostCategory, formatPrice, formatDate } from '../lib/utils'
import CategoryBadge from './CategoryBadge'
import StatusBadge from './StatusBadge'

function PostCard({ post, actions, to }) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const img = post.images?.[0]
  const title = getPostTitle(post, t)
  const price = formatPrice(post.price_amount, post.price_unit, t)
  const location = [post.district, post.province].filter(Boolean).join(', ')

  return (
    <motion.div
      layout={!shouldReduceMotion}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
      className="bg-surface border border-border/20 shadow-card rounded-card overflow-hidden flex flex-col"
    >
      <Link to={to ?? `/posts/${post.id}`} className="block">
        <div className="relative h-44 bg-surface2 overflow-hidden">
          {img ? (
            <img
              src={getImageUrl(img)}
              alt={title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted text-sm">
              {t('posts.noImage')}
            </div>
          )}
          {post.approval_status && (
            <div className="absolute top-2 right-2">
              <StatusBadge status={post.approval_status} />
            </div>
          )}
        </div>
        <div className="p-3.5">
          <CategoryBadge category={getPostCategory(post)} />
          <p className="text-sm md:text-base font-semibold text-text mt-2 line-clamp-2 leading-tight">{title}</p>
          {price && <p className="text-primary font-bold text-sm md:text-base mt-1">{price}</p>}
          <div className="flex flex-wrap items-center justify-between mt-2">
            {location && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <MapPin size={11} /> {location}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-muted ml-auto">
              <Eye size={11} /> {post.views ?? 0}
            </span>
          </div>
          <p className="text-xs text-muted mt-1">{formatDate(post.date_created)}</p>
        </div>
      </Link>
      {actions && <div className="px-3.5 pb-3.5 mt-2.5">{actions}</div>}
    </motion.div>
  )
}

export default memo(PostCard)
