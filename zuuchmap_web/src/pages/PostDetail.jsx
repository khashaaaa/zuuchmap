import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  MapPin, Eye, Phone, Mail, Globe,
  ArrowLeft, Heart, Building2, Pencil, Trash2, Calendar, CalendarRange,
  ChevronLeft, ChevronRight, MessageSquare, Flag } from 'lucide-react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { tileLayerProps } from '@/lib/mapTiles'
import 'leaflet/dist/leaflet.css'
import { postsApi, likesApi } from '@/lib/api'
import { formatDate, formatPriceParts, getImageUrl, getCompanyLogoUrl, getPostTitle, getPostCategory, getCategoryColor, getFieldLabel, getOptionLabel, getSubcategoryLabel, goBack, normalizeWebsiteUrl, withAlpha, toneForTheme, hideBrokenImage, getLocationLabel, telHref } from '@/lib/utils'
import { categoryPin } from '@/lib/mapPin'
import UserAvatar from '@/components/UserAvatar'
import AlertBanner from '@/components/AlertBanner'
import BookingRequest from '@/components/BookingRequest'
import { track } from '@/lib/analytics'
import ProviderReviews from '@/components/ProviderReviews'
import ProviderCredentials from '@/components/ProviderCredentials'
import SimilarPosts from '@/components/SimilarPosts'
import AvailabilityStrip from '@/components/AvailabilityStrip'
import { useAuthStore, useThemeStore } from '@/store'
import StatusBadge, { Chip } from '@/components/StatusBadge'
import Input from '@/components/Input'
import Button from '@/components/Button'
import ConfirmModal from '@/components/ConfirmModal'
import PostModerationPanel from '@/components/PostModerationPanel'
import { usePostModeration } from '@/hooks/usePostModeration'
import ImageLightbox from '@/components/ImageLightbox'
import { useHotkeys } from '@/hooks/useHotkeys'
import { useCategories } from '@/hooks/useCategories'
import { invalidatePostQueries } from '@/lib/queryClient'
import { toast } from 'sonner'
import InfoSection from '@/components/InfoSection'
import CollapsibleSection from '@/components/CollapsibleSection'
import CategoryBadge from '@/components/CategoryBadge'
import ErrorState from '@/components/ErrorState'
import ReportModal from '@/components/ReportModal'
import { reportsApi } from '@/lib/api'
import { messagesApi } from '@/lib/api'
import useDocumentMeta from '@/hooks/useDocumentMeta'

// React renders a raw boolean as nothing and an array as concatenated text, so
// every attribute value goes through here before display.
function attrDisplay(def, v, t) {
  if (typeof v === 'boolean' || def?.type === 'boolean') {
    return v === true ? t('common.yes') : t('common.no')
  }
  if (Array.isArray(v)) return v.map((x) => getOptionLabel(x, t)).join(', ')
  if (def?.type === 'select') return getOptionLabel(v, t)
  return def?.unit ? `${v} ${def.unit}` : String(v)
}

export default function PostDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  // Set by the moderation queue's links. Only a decision made *from* the queue
  // should return to it — an admin who opened this post from browse expects to
  // stay where they were.
  const cameFromQueue = useLocation().state?.from === 'queue'
  // `?review=1` is what the review-prompt push links to: bring the review
  // section into view once the page has something to scroll to.
  const [searchParams] = useSearchParams()
  const wantsReview = searchParams.get('review') === '1'
  const reviewRef = useRef(null)
  const qc = useQueryClient()
  const { token, user: currentUser, isAdmin } = useAuthStore()
  const [reportOpen, setReportOpen] = useState(false)
  const { theme } = useThemeStore()

  const [activeImg, setActiveImg] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const { data: post, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['post', id],
    queryFn: () => postsApi.getOne(id),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!wantsReview || !post?.id || !reviewRef.current) return
    const timer = setTimeout(() => {
      reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      reviewRef.current?.focus?.({ preventScroll: true })
    }, 150)
    return () => clearTimeout(timer)
  }, [wantsReview, post?.id])

  useEffect(() => {
    if (post?.id) track('post.detail.view', { post_id: post.id, category: post.category })
  }, [post?.id, post?.category])

  // Per-listing title, description and social card. index.html carries one set
  // of tags for the whole SPA, so every listing shared the landing page's blurb
  // and OG image. Google runs JavaScript and sees this; Facebook and Messenger
  // do not, and are served pre-rendered tags by the engine via nginx instead.
  useDocumentMeta({
    title: post?.title || post?.name || undefined,
    description: (post?.details || post?.description || '').replace(/\s+/g, ' ').slice(0, 200) || undefined,
    image: getImageUrl(post?.images?.[0]) || undefined,
    url: post?.id ? `${window.location.origin}/posts/${post.id}` : undefined,
  })

  const { data: schemas = [], isError: schemasError, refetch: refetchSchemas } = useCategories()
  const schema = schemas.find((s) => s.key === getPostCategory(post))

  useEffect(() => {
    if (!post?.id || !token) return
    const timer = setTimeout(() => postsApi.view(post.id).catch(() => {}), 2000)
    return () => clearTimeout(timer)
  }, [post?.id, token])

  const { data: likeData } = useQuery({
    queryKey: ['like-check', id],
    queryFn: () => likesApi.check(getPostCategory(post), id),
    enabled: Boolean(token && post),
    staleTime: 30_000,
  })

  const deleteMut = useMutation({
    mutationFn: () => postsApi.remove(id),
    onSuccess: () => {
      invalidatePostQueries(qc)
      toast.success(t('posts.deleted'))
      // Never navigate(-1) here: back can land on the post we just deleted.
      navigate(isAdmin ? '/admin/posts' : '/provider/posts', { replace: true })
    },
    onError: () => toast.error(t('common.error')),
  })

  const mod = usePostModeration({ post, id, isAdmin, cameFromQueue })

  // What users have flagged on this listing. The queue page links here, and an
  // admin arriving from anywhere else still needs to see the complaint next to
  // the thing complained about.
  const { data: openReports } = useQuery({
    queryKey: ['reports', 'OPEN', { post_id: Number(id) }],
    queryFn: () => reportsApi.list({ status: 'OPEN', post_id: id }),
    enabled: isAdmin && Boolean(post),
  })
  const { editMode, editedTitle, setEditedTitle, editedDetails, setEditedDetails } = mod

  // The photo is the product, and the only way through it used to be tapping a
  // 64px thumbnail — no arrows, no swipe, no keys. Wraps around: at the last
  // frame "next" returns to the first rather than dead-ending.
  const imageCount = post?.images?.length ?? 0
  const stepImage = useCallback((delta) => {
    setActiveImg((i) => (i + delta + imageCount) % imageCount)
  }, [imageCount])
  useHotkeys({
    ArrowLeft: () => stepImage(-1),
    ArrowRight: () => stepImage(1),
    // The location map is keyboard-pannable and its container is focusable, so
    // it must keep its own arrow keys while it has focus.
  }, { enabled: imageCount > 1 && !zoomed, ignoreWithin: '.leaflet-container' })

  // Swipe. A tracked axis, not just distance — a vertical scroll that drifts
  // sideways must not count as a page turn.
  const touchRef = useRef(null)
  const onTouchStart = (e) => {
    const p = e.touches[0]
    touchRef.current = { x: p.clientX, y: p.clientY }
  }
  const onTouchEnd = (e) => {
    const start = touchRef.current
    touchRef.current = null
    if (!start || imageCount < 2) return
    const p = e.changedTouches[0]
    const dx = p.clientX - start.x
    const dy = p.clientY - start.y
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    stepImage(dx < 0 ? 1 : -1)
  }

  if (isLoading) return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-3">
      <div className="h-56 skeleton rounded-card" />
      <div className="h-6 skeleton rounded w-3/4" />
      <div className="h-4 skeleton rounded w-1/2" />
    </div>
  )

  // A 404 means the listing is genuinely gone; anything else means we failed to
  // ask, and the user deserves a retry rather than "no results".
  if (isError && error?.response?.status !== 404) return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <ErrorState onRetry={refetch} />
    </div>
  )

  if (!post) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-muted">{t('posts.browseEmpty')}</p>
    </div>
  )

  const isOwner = !!currentUser && !!post && post.user?.id === currentUser.id
  const isPendingApproval = post.approval_status === 'PENDING'
  // Mirrors the engine's booking availability gate in booking.service.ts.
  const isBookable = post.status === 'ACTIVE'
    && (!post.expires_at || new Date(post.expires_at) > new Date())
  const priceParts = formatPriceParts(post.price_amount, post.price_unit, t)
  const location = getLocationLabel(post, t)
  const title = getPostTitle(post, t)
  const isDark = theme !== 'light'
  const catColor = getCategoryColor(getPostCategory(post), schemas)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => goBack(navigate, isAdmin ? '/admin/posts' : '/browse')} className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors">
          <ArrowLeft size={15} /> {t('common.back')}
        </button>
        <div className="flex items-center gap-2">
          {isAdmin && isPendingApproval && (
            <button
              onClick={mod.toggleEditMode}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-btn border transition-colors ${editMode ? 'border-primary/40 text-primary-text bg-primary/10' : 'border-border/50 text-muted hover:text-text'}`}
            >
              {editMode ? t('admin.editDone') : t('admin.editPost')}
            </button>
          )}
          {isOwner && (
            <>
              <Link
                to={`/provider/posts/${id}/edit`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border/50 rounded-btn text-muted hover:text-primary-text hover:border-primary/40 transition-colors"
              >
                <Pencil size={13} /> {t('posts.edit')}
              </Link>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border/50 rounded-btn text-muted hover:text-danger hover:border-danger/40 transition-colors"
              >
                <Trash2 size={13} /> {t('common.delete')}
              </button>
            </>
          )}
        </div>
      </div>

      {isAdmin && openReports?.items?.length > 0 && (
        <AlertBanner variant="warning" className="mb-4">
          <div className="min-w-0">
            <p className="font-semibold">{t('report.openOnPost', { count: openReports.total ?? openReports.items.length })}</p>
            <ul className="mt-1 space-y-0.5">
              {openReports.items.slice(0, 5).map((r) => (
                <li key={r.id} className="text-xs">
                  {t(`report.reasons.${r.reason}`)}{r.detail ? ` — ${r.detail}` : ''}
                </li>
              ))}
            </ul>
            <Link to="/admin/reports" className="inline-block mt-1.5 text-xs underline">{t('report.queue')}</Link>
          </div>
        </AlertBanner>
      )}

      {/* Rejection reason banner — page-level alert, spans full width */}
      {post.rejection_reason && post.approval_status === 'REJECTED' && (
        <AlertBanner variant="danger" className="mb-4">
          {t('admin.rejectReason')}: {post.rejection_reason}
        </AlertBanner>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0 w-full surface-card">
          {/* Images — the photo is the product; give it a real canvas, count the
              frames, and let a photo-less listing wear its category instead of grey. */}
          <div>
            <div
              className="relative aspect-[4/3] md:aspect-[16/10] bg-surface2 overflow-hidden"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {post.images?.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setZoomed(true)}
                    aria-label={t('posts.viewImage', { index: activeImg + 1 })}
                    className="block w-full h-full cursor-zoom-in"
                  >
                    <img src={getImageUrl(post.images[activeImg])} alt={title} className="w-full h-full object-cover" onError={hideBrokenImage} />
                  </button>
                  {post.images.length > 1 && (
                    <>
                      {/* Arrows, swipe and ←/→ all drive the same step. The
                          thumbnail strip was the only way through the photos,
                          which on a phone is a 64px target per frame. */}
                      <button
                        type="button"
                        onClick={() => stepImage(-1)}
                        aria-label={t('posts.viewImage', { index: ((activeImg - 1 + post.images.length) % post.images.length) + 1 })}
                        className="absolute left-2 top-1/2 -translate-y-1/2 min-w-touch min-h-touch flex items-center justify-center rounded-full bg-scrim text-white hover:bg-black/70 transition-colors"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={() => stepImage(1)}
                        aria-label={t('posts.viewImage', { index: ((activeImg + 1) % post.images.length) + 1 })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 min-w-touch min-h-touch flex items-center justify-center rounded-full bg-scrim text-white hover:bg-black/70 transition-colors"
                      >
                        <ChevronRight size={20} />
                      </button>
                      <span className="absolute bottom-2 right-2 rounded-btn bg-scrim px-2 py-0.5 text-xs font-medium text-white tabular-nums">
                        {activeImg + 1} / {post.images.length}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-sm"
                  style={catColor ? { backgroundColor: withAlpha(catColor, isDark ? 0.14 : 0.1), color: toneForTheme(catColor, isDark) } : undefined}
                >
                  <span className={catColor ? 'opacity-80' : 'text-muted'}>{t('posts.noImage')}</span>
                </div>
              )}
            </div>
            {post.images?.length > 1 && (
              <div className="flex gap-2 p-3 overflow-x-auto">
                {post.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    aria-label={t('posts.viewImage', { index: i + 1 })}
                    aria-pressed={i === activeImg}
                    className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-surface2 border-2 transition-colors ${i === activeImg ? '' : 'border-transparent'}`}
                    style={i === activeImg ? { borderColor: catColor || 'var(--color-primary)' } : undefined}
                  >
                    <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" onError={hideBrokenImage} />
                  </button>
                ))}
              </div>
            )}
            {zoomed && post.images?.length > 0 && (
              <ImageLightbox
                images={post.images}
                index={activeImg}
                title={title}
                onClose={() => setZoomed(false)}
                onStep={stepImage}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              />
            )}
          </div>

          <div className="p-5 space-y-4">
            {/* Title + badges + status */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <CategoryBadge category={getPostCategory(post)} />
                  {post.subcategory && (
                    <Chip>{getSubcategoryLabel(post.subcategory, t, schema)}</Chip>
                  )}
                </div>
                {isAdmin && editMode ? (
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="border-primary/40 font-bold"
                    maxLength={200}
                  />
                ) : (
                  <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-text break-words">{editedTitle || getPostTitle(post, t)}</h1>
                )}
              </div>
              <StatusBadge status={post.approval_status} />
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-muted">
              {location && <span className="flex items-center gap-1"><MapPin size={13} /> {location}</span>}
              <span className="flex items-center gap-1 tabular-nums"><Eye size={13} /> {t('posts.viewCountValue', { count: post.views ?? 0 })}</span>
              <span className="text-xs">{formatDate(post.date_created)}</span>
            </div>

            {/* Booked days at a glance — rental categories only (the engine
                sends busy_dates for nothing else). */}
            {schema?.has_rental_status && Array.isArray(post.busy_dates) && (
              <AvailabilityStrip busyDates={post.busy_dates} size="md" />
            )}

            {/* Details */}
            {(post.details || (isAdmin && editMode)) && (
              <div className="pt-4 border-t border-border/50">
                <p className="text-sm text-muted font-medium mb-1">{t('posts.details')}</p>
                {isAdmin && editMode ? (
                  <>
                    <Input
                      as="textarea"
                      value={editedDetails}
                      onChange={(e) => setEditedDetails(e.target.value)}
                      rows={4}
                      className="border-primary/40 resize-none"
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted text-right mt-1">{editedDetails.length}/2000</p>
                  </>
                ) : (
                  <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{post.details}</p>
                )}
              </div>
            )}

            {/* Availability + category attributes — secondary metadata, tucked behind a disclosure */}
            {((post.available_from || post.available_until) || (post.attributes && Object.keys(post.attributes).length > 0)) && (
              <CollapsibleSection title={t('posts.attributes')} variant="bare">
                {(post.available_from || post.available_until) && (
                  <div className="flex flex-wrap gap-4">
                    {post.available_from && (
                      <div>
                        <p className="text-xs text-muted mb-0.5 flex items-center gap-1"><Calendar size={11} /> {t('posts.availableFrom')}</p>
                        <p className="text-sm text-text font-medium">{formatDate(post.available_from)}</p>
                      </div>
                    )}
                    {post.available_until && (
                      <div>
                        <p className="text-xs text-muted mb-0.5 flex items-center gap-1"><Calendar size={11} /> {t('posts.availableUntil')}</p>
                        <p className="text-sm text-text font-medium">{formatDate(post.available_until)}</p>
                      </div>
                    )}
                  </div>
                )}
                {post.attributes && Object.keys(post.attributes).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(post.attributes).map(([k, v]) => {
                      const def = schema?.fields?.find((f) => f.key === k)
                      // Skip only genuine absences. `false` and `0` are answers —
                      // "no operator included" must render, not vanish.
                      if (v === undefined || v === null || v === '') return null
                      if (Array.isArray(v) && v.length === 0) return null
                      return (
                        <div key={k} className="bg-surface2 rounded-lg px-3 py-2">
                          <p className="text-xs text-muted">
                            {getFieldLabel(def ?? { key: k, label: k.replace(/_/g, ' ') }, t)}
                          </p>
                          <p className="text-sm text-text font-medium">{attrDisplay(def, v, t)}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Map */}
            {post.latitude && post.longitude && (
              <InfoSection>
                <p className="text-sm text-muted font-medium mb-2 flex items-center gap-1.5">
                  <MapPin size={14} /> {t('posts.location')}
                </p>
                <div className="h-40 rounded-lg overflow-hidden border border-border/50">
                  <MapContainer center={[Number(post.latitude), Number(post.longitude)]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                    <TileLayer
                      key={theme}
                      {...tileLayerProps(theme === 'dark')}
                    />
                    <Marker
                      position={[Number(post.latitude), Number(post.longitude)]}
                      icon={categoryPin(getCategoryColor(getPostCategory(post), schemas))}
                    />
                  </MapContainer>
                </div>
              </InfoSection>
            )}

            {/* Poster info */}
            {post.user && (
              <InfoSection className="space-y-3">
                <div className="flex items-center gap-3">
                  <UserAvatar src={post.user.profile_picture} name={post.user.given_name} size="sm" />
                  <div>
                    <p className="text-xs text-muted">{t('onboarding.provider')}</p>
                    <p className="text-sm text-text font-medium">
                      {[post.user.given_name, post.user.parent_name].filter(Boolean).join(' ') || post.user.phone_number}
                    </p>
                    {isAdmin && post.user.phone_number && (
                      <p className="text-xs text-muted">{post.user.phone_number}</p>
                    )}
                  </div>
                </div>
                {post.user.company && (
                  <div className="flex items-start gap-3 bg-surface2 rounded-lg p-3">
                    {post.user.company.logo
                      ? <img src={getCompanyLogoUrl(post.user.company.logo)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={hideBrokenImage} />
                      : <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Building2 size={18} className="text-primary-text" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text">{post.user.company.name}</p>
                      {post.user.company.phone_number && (
                        <a href={telHref(post.user.company.phone_number)} className="flex items-center gap-1 text-xs text-muted hover:text-primary-text transition-colors mt-0.5">
                          <Phone size={11} className="shrink-0" /> <span className="break-all">{post.user.company.phone_number}</span>
                        </a>
                      )}
                      {post.user.company.website && (
                        <a href={normalizeWebsiteUrl(post.user.company.website)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted hover:text-primary-text transition-colors mt-0.5">
                          <Globe size={11} className="shrink-0" /> <span className="break-all">{post.user.company.website}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </InfoSection>
            )}

            {/* Provider credentials + reviews — one query feeds both */}
            {post.user && <ProviderCredentials providerId={post.user.id} className="pt-4" />}
            {post.user && (
              <div ref={reviewRef} tabIndex={-1} className="outline-none scroll-mt-20">
                <ProviderReviews
                  providerId={post.user.id}
                  canReview={Boolean(token) && !isOwner && !isAdmin && currentUser?.type === 'CUSTOMER'}
                />
              </div>
            )}
          </div>
        </div>

        {/* Action sidebar — sticky on desktop */}
        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-(--sticky-offset) space-y-4">
          <div
            className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 space-y-4"
            style={catColor ? { borderTop: `3px solid ${catColor}` } : undefined}
          >
            {/* The number gets to be big; what it *is* gets an overline; the
                unit steps back — one glance answers "how much, per what". */}
            {priceParts && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">{t('posts.priceLabel')}</p>
                {/* Amount and unit are separate flex items, so a long Mongolian
                    unit drops to its own line instead of overrunning the card —
                    inline they had no break opportunity between them (no
                    whitespace, and a margin is not one). `lg:text-3xl` steps the
                    number back down inside the 320px sticky sidebar, where a
                    nine-figure ₮ amount would not fit at 4xl. */}
                <p className="flex flex-wrap items-baseline gap-x-1 text-3xl md:text-4xl lg:text-3xl font-extrabold text-text tabular-nums leading-none">
                  <span>{priceParts.amount}</span>
                  {/* nowrap keeps the separator with the unit — otherwise a long
                      Mongolian unit wraps and strands the slash on the amount line. */}
                  {priceParts.unit && <span className="text-base font-normal text-muted whitespace-nowrap">/{priceParts.unit}</span>}
                </p>
              </div>
            )}

            {/* The one saturated element in the column — the action the page
                exists for, visible signed-out too. */}
            {post.contact_phone && !isOwner && !isAdmin && (
              <Button
                href={telHref(post.contact_phone)}
                size="lg"
                className="w-full tabular-nums"
                onClick={() => track('contact.revealed', { post_id: post.id, category: post.category })}
              >
                <Phone size={16} /> {post.contact_phone}
              </Button>
            )}

            {/* Like button — customers only */}
            {token && !isOwner && !isAdmin && currentUser?.type === 'CUSTOMER' && (
              <LikeButton post={post} liked={likeData?.is_liked} />
            )}

            {/* A signed-out visitor used to get no save affordance at all — the
                control simply was not rendered. This is the public post page and
                the main way people arrive, so offer the account instead of
                silently withholding the feature. */}
            {!token && (
              <Button variant="outline" className="w-full" onClick={() => navigate('/login', { state: { from: `/posts/${id}` } })}>
                <Heart size={14} /> {t('common.save')}
              </Button>
            )}

            {/* Contact */}
            {((post.contact_phone && (isOwner || isAdmin)) || post.contact_email || post.website) && (
              <div className="pt-4 border-t border-border/50 space-y-2 first:border-t-0 first:pt-0">
                <p className="text-sm text-muted font-medium">{t('posts.contactInfo')}</p>
                {post.contact_phone && (isOwner || isAdmin) && (
                  <a href={telHref(post.contact_phone)} className="flex items-center gap-2 text-sm text-text hover:text-primary-text transition-colors">
                    <Phone size={14} className="text-muted shrink-0" /> <span className="break-all">{post.contact_phone}</span>
                  </a>
                )}
                {post.contact_email && (
                  <a href={`mailto:${post.contact_email}`} className="flex items-center gap-2 text-sm text-text hover:text-primary-text transition-colors">
                    <Mail size={14} className="text-muted shrink-0" /> <span className="break-all">{post.contact_email}</span>
                  </a>
                )}
                {post.website && (
                  <a href={normalizeWebsiteUrl(post.website)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text hover:text-primary-text transition-colors">
                    <Globe size={14} className="text-muted shrink-0" /> <span className="break-all">{post.website}</span>
                  </a>
                )}
              </div>
            )}

            {/* Booking request — signed-in customers on rental posts. Availability
                is separate from approval: RENTED is the provider's own "not right
                now", and a lapsed post has nobody answering. Offering the form
                anyway just walks the customer into the engine's rejection. */}
            {/* Same predicate as the app and as booking.service.ts. No account-type
                test: the engine has none, so requiring CUSTOMER here blocked a
                provider from renting another provider's machinery. */}
            {token && !isOwner && !isAdmin && schema?.has_rental_status && post.user && (
              <div className="pt-4 border-t border-border/50">
                {isBookable
                  ? <BookingRequest postId={post.id} />
                  : <p className="text-sm text-muted">{t('errors.codes.BOOKING_POST_UNAVAILABLE')}</p>}
              </div>
            )}

            {/* Message the owner. Available on every listing, not just bookable
                ones: "is this still available" is the question customers
                actually have, and it used to be answerable only by phone —
                which left the platform with no record of what was agreed. */}
            {token && !isOwner && !isAdmin && post.user && (
              <div className="pt-4 border-t border-border/50 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const thread = await messagesApi.open(post.id)
                      navigate(`/messages/${thread.id}`)
                    } catch {
                      toast.error(t('messages.failed'))
                    }
                  }}
                >
                  <MessageSquare size={14} /> {t('messages.messageProvider')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setReportOpen(true)}
                  aria-label={t('report.action')}
                >
                  <Flag size={14} /> {t('report.action')}
                </Button>
              </div>
            )}

            {/* The same reasoning as the save button above: a signed-out visitor
                on a bookable rental got no booking affordance and no reason why,
                even though "sign in to save" sat right beside it. Arriving from
                search and wanting to book is the likelier intent of the two. */}
            {!token && schema?.has_rental_status && post.user && isBookable && (
              <div className="pt-4 border-t border-border/50">
                <Button
                  className="w-full"
                  onClick={() => navigate('/login', { state: { from: `/posts/${id}` } })}
                >
                  <CalendarRange size={14} /> {t('booking.book')}
                </Button>
              </div>
            )}

            {/* Schemas failed to load — without them we can't tell whether this
                post is bookable, so say so instead of silently hiding booking. */}
            {token && !isOwner && !isAdmin && currentUser?.type === 'CUSTOMER' && schemasError && !schema && (
              <div className="pt-4 border-t border-border/50">
                <p className="text-xs text-muted">{t('common.loadFailed')}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={refetchSchemas}>
                  {t('common.retry')}
                </Button>
              </div>
            )}

            {isAdmin && <PostModerationPanel mod={mod} post={post} schema={schema} />}
          </div>
        </div>
      </div>

      <SimilarPosts postId={id} />

      {/* Delete modal */}
      <ConfirmModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('posts.deleteConfirmTitle')}
        message={t('posts.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { deleteMut.mutate(); setShowDeleteModal(false) }}
        isPending={deleteMut.isPending}
      />

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} postId={post.id} />
    </div>
  )
}

function LikeButton({ post, liked }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // Display is derived from the `like-check` query, patched optimistically and
  // rolled back on error; a local useState seeded before the query resolved
  // never showed the saved state at all.
  const key = ['like-check', String(post.id)] // same shape as the page query above
  const { mutate, isPending } = useMutation({
    mutationFn: (next) =>
      next ? likesApi.toggle(post.id, getPostCategory(post)) : likesApi.unlike(getPostCategory(post), post.id),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old) => ({ ...(old ?? {}), is_liked: next }))
      return previous
    },
    onSuccess: (_, next) => {
      qc.invalidateQueries({ queryKey: ['liked-posts'] })
      qc.invalidateQueries({ queryKey: ['liked-ids'] })
      toast.success(t(next ? 'posts.saved' : 'posts.unsaved'))
    },
    onError: (_, __, previous) => {
      qc.setQueryData(key, previous)
      toast.error(t('common.error'))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
  const optimistic = Boolean(liked)
  return (
    <button
      onClick={() => mutate(!optimistic)}
      disabled={isPending}
      className={`flex items-center gap-2 px-4 py-2 rounded-btn border text-sm font-medium transition-colors disabled:opacity-50 ${
        optimistic ? 'bg-primary/15 text-primary-text border-primary/30' : 'border-border/50 text-muted hover:text-primary-text hover:border-primary/40'
      }`}
    >
      <Heart size={15} className={isPending ? 'animate-pulse' : ''} fill={optimistic ? 'currentColor' : 'none'} />
      {optimistic ? t('nav.saved') : t('common.save')}
    </button>
  )
}
