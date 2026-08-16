import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle, XCircle, MapPin, Eye, Phone, Mail, Globe,
  ArrowLeft, Heart, Building2, Pencil, Trash2, Calendar,
} from 'lucide-react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { postsApi, adminApi, likesApi, categoryApi } from '@/lib/api'
import { formatDate, formatPrice, getImageUrl, getCompanyLogoUrl, getPostTitle, getPostCategory, getFieldLabel } from '@/lib/utils'
import UserAvatar from '@/components/UserAvatar'
import AlertBanner from '@/components/AlertBanner'
import BookingRequest from '@/components/BookingRequest'
import ProviderReviews from '@/components/ProviderReviews'
import { useAuthStore, useThemeStore } from '@/store'
import StatusBadge from '@/components/StatusBadge'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import ConfirmModal from '@/components/ConfirmModal'
import { toast } from 'sonner'
import InfoSection from '@/components/InfoSection'
import CollapsibleSection from '@/components/CollapsibleSection'
import CategoryBadge from '@/components/CategoryBadge'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function PostDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { token, user: currentUser, isAdmin } = useAuthStore()
  const { theme } = useThemeStore()

  const [activeImg, setActiveImg] = useState(0)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedDetails, setEditedDetails] = useState('')

  const { data: post, isLoading } = useQuery({
    queryKey: ['post', id],
    queryFn: () => postsApi.getOne(id),
    staleTime: 60_000,
  })

  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })
  const schema = schemas.find((s) => s.key === getPostCategory(post))

  useEffect(() => {
    if (!post?.id || !token) return
    const timer = setTimeout(() => postsApi.view(post.id).catch(() => {}), 2000)
    return () => clearTimeout(timer)
  }, [post?.id, token])

  useEffect(() => {
    if (post) {
      setEditedTitle(post.title || post.name || '')
      setEditedDetails(post.details || post.description || '')
    }
  }, [post?.id])

  const { data: likeData } = useQuery({
    queryKey: ['like-check', id],
    queryFn: () => likesApi.check(getPostCategory(post), id),
    enabled: Boolean(token && post),
    staleTime: 30_000,
  })

  const deleteMut = useMutation({
    mutationFn: () => postsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-posts'] })
      toast.success(t('posts.deleted'))
      navigate(-1)
    },
    onError: () => toast.error(t('common.error')),
  })

  const approveMut = useMutation({
    mutationFn: () => adminApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post', id] })
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      toast.success(t('admin.approveSuccess'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const rejectMut = useMutation({
    mutationFn: () => adminApi.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post', id] })
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setRejectOpen(false)
      toast.success(t('admin.rejectSuccess'))
    },
    onError: () => toast.error(t('common.error')),
  })

  if (isLoading) return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-3">
      <div className="h-56 bg-surface2 rounded-card animate-pulse" />
      <div className="h-6 bg-surface2 rounded animate-pulse w-3/4" />
      <div className="h-4 bg-surface2 rounded animate-pulse w-1/2" />
    </div>
  )

  if (!post) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-muted">{t('posts.browseEmpty')}</p>
    </div>
  )

  const isOwner = !!currentUser && !!post && post.user?.id === currentUser.id
  const isPendingApproval = post.approval_status === 'PENDING'
  const price = formatPrice(post.price_amount, post.price_unit, t)
  const location = [post.district, post.province].filter(Boolean).join(', ')

  const originalTitle = post.title || post.name || ''
  const originalDetails = post.details || post.description || ''
  const hasEdits = editedTitle.trim() !== originalTitle || editedDetails.trim() !== originalDetails

  const saveEdits = () => hasEdits
    ? adminApi.editPost(id, { title: editedTitle.trim() || undefined, details: editedDetails.trim() || undefined })
    : Promise.resolve()
  const handleSaveAndApprove = () => saveEdits().then(() => approveMut.mutate())
  const handleReject = () => saveEdits().then(() => rejectMut.mutate())
  const REASON_TYPES = Object.values(t('admin.reasonTypes', { returnObjects: true }))

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors">
          <ArrowLeft size={15} /> {t('common.back')}
        </button>
        <div className="flex items-center gap-2">
          {isAdmin && isPendingApproval && (
            <button
              onClick={() => setEditMode(p => !p)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-btn border transition-colors ${editMode ? 'border-primary/40 text-primary bg-primary/10' : 'border-border/50 text-muted hover:text-text'}`}
            >
              {editMode ? t('admin.editDone') : t('admin.editPost')}
            </button>
          )}
          {isOwner && (
            <>
              <Link
                to={`/provider/posts/${id}/edit`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border/50 rounded-btn text-muted hover:text-primary hover:border-primary/40 transition-colors"
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

      {/* Rejection reason banner — page-level alert, spans full width */}
      {post.rejection_reason && (
        <AlertBanner variant="danger" className="mb-4">
          {t('admin.rejectReason')}: {post.rejection_reason}
        </AlertBanner>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0 w-full bg-surface border border-border/20 shadow-card rounded-card overflow-hidden">
          {/* Images */}
          {post.images?.length > 0 && (
            <div>
              <div className="h-72 bg-surface2 overflow-hidden">
                <img src={getImageUrl(post.images[activeImg])} alt="" className="w-full h-full object-cover" />
              </div>
              {post.images.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {post.images.map((img, i) => (
                    <button key={i} onClick={() => setActiveImg(i)} className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors ${i === activeImg ? 'border-primary' : 'border-transparent'}`}>
                      <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="p-5 space-y-4">
            {/* Title + badges + status */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <CategoryBadge category={getPostCategory(post)} />
                  {post.subcategory && (
                    <span className="inline-block px-2 py-0.5 text-xs rounded-md bg-surface2 text-muted border border-border/50 font-medium">
                      {t(`subcategory.${post.subcategory}`, { defaultValue: post.subcategory })}
                    </span>
                  )}
                </div>
                {isAdmin && editMode ? (
                  <input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="w-full bg-surface2 border border-primary/40 rounded-btn px-3 py-1.5 text-base font-bold text-text outline-none focus:border-primary"
                    maxLength={200}
                  />
                ) : (
                  <h1 className="text-xl font-bold text-text">{editedTitle || getPostTitle(post, t)}</h1>
                )}
              </div>
              <StatusBadge status={post.approval_status} />
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-muted">
              {location && <span className="flex items-center gap-1"><MapPin size={13} /> {location}</span>}
              <span className="flex items-center gap-1"><Eye size={13} /> {t('posts.viewCount', { count: post.views ?? 0 })}</span>
              <span className="text-xs">{formatDate(post.date_created)}</span>
            </div>

            {/* Details */}
            {(post.details || (isAdmin && editMode)) && (
              <div className="pt-4 border-t border-border/50">
                <p className="text-sm text-muted font-medium mb-1">{t('posts.details')}</p>
                {isAdmin && editMode ? (
                  <textarea
                    value={editedDetails}
                    onChange={(e) => setEditedDetails(e.target.value)}
                    rows={4}
                    className="w-full bg-surface2 border border-primary/40 rounded-btn px-3 py-2 text-sm text-text outline-none focus:border-primary resize-none"
                    maxLength={2000}
                  />
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
                    {Object.entries(post.attributes).map(([k, v]) => v && (
                      <div key={k} className="bg-surface2 rounded-lg px-3 py-2">
                        <p className="text-xs text-muted">
                          {getFieldLabel(schema?.fields?.find((f) => f.key === k) ?? { key: k, label: k.replace(/_/g, ' ') }, t)}
                        </p>
                        <p className="text-sm text-text font-medium">{v}</p>
                      </div>
                    ))}
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
                      url={`https://{s}.basemaps.cartocdn.com/${theme === 'dark' ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                    />
                    <Marker position={[Number(post.latitude), Number(post.longitude)]} />
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
                      ? <img src={getCompanyLogoUrl(post.user.company.logo)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      : <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Building2 size={18} className="text-primary" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text">{post.user.company.name}</p>
                      {post.user.company.phone_number && (
                        <a href={`tel:${post.user.company.phone_number}`} className="flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors mt-0.5">
                          <Phone size={11} /> {post.user.company.phone_number}
                        </a>
                      )}
                      {post.user.company.website && (
                        <a href={post.user.company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors mt-0.5">
                          <Globe size={11} /> {post.user.company.website}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </InfoSection>
            )}

            {/* Provider reviews */}
            {post.user && (
              <ProviderReviews
                providerId={post.user.id}
                canReview={Boolean(token) && !isOwner && !isAdmin && currentUser?.type === 'CUSTOMER'}
              />
            )}
          </div>
        </div>

        {/* Action sidebar — sticky on desktop */}
        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-6 space-y-4">
          <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 space-y-4">
            {price && <p className="text-primary font-bold text-2xl">{price}</p>}

            {/* Like button — customers only */}
            {token && !isOwner && !isAdmin && currentUser?.type === 'CUSTOMER' && (
              <LikeButton post={post} liked={likeData?.is_liked} />
            )}

            {/* Contact */}
            {(post.contact_phone || post.contact_email || post.website) && (
              <div className="pt-4 border-t border-border/50 space-y-2 first:border-t-0 first:pt-0">
                <p className="text-sm text-muted font-medium">{t('posts.contactInfo')}</p>
                {post.contact_phone && (
                  <a href={`tel:${post.contact_phone}`} className="flex items-center gap-2 text-sm text-text hover:text-primary transition-colors">
                    <Phone size={14} className="text-muted" /> {post.contact_phone}
                  </a>
                )}
                {post.contact_email && (
                  <a href={`mailto:${post.contact_email}`} className="flex items-center gap-2 text-sm text-text hover:text-primary transition-colors">
                    <Mail size={14} className="text-muted" /> {post.contact_email}
                  </a>
                )}
                {post.website && (
                  <a href={post.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text hover:text-primary transition-colors">
                    <Globe size={14} className="text-muted" /> {post.website}
                  </a>
                )}
              </div>
            )}

            {/* Booking request — signed-in customers on rental posts */}
            {token && !isOwner && !isAdmin && currentUser?.type === 'CUSTOMER' && schema?.has_rental_status && post.user && (
              <div className="pt-4 border-t border-border/50">
                <BookingRequest postId={post.id} />
              </div>
            )}

            {/* Admin approve / reject */}
            {isAdmin && isPendingApproval && (
              <div className="pt-4 border-t border-border/50 space-y-2">
                {hasEdits && editMode && (
                  <p className="text-xs text-muted italic">{t('admin.editHint')}</p>
                )}
                <button
                  onClick={handleSaveAndApprove}
                  disabled={approveMut.isPending || rejectMut.isPending}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-success/15 text-success border border-success/20 rounded-btn text-sm font-medium hover:bg-success/20 transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={15} /> {hasEdits ? t('admin.saveAndApprove') : t('admin.approve')}
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  disabled={approveMut.isPending || rejectMut.isPending}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-danger/15 text-danger border border-danger/20 rounded-btn text-sm font-medium hover:bg-danger/20 transition-colors disabled:opacity-50"
                >
                  <XCircle size={15} /> {t('admin.reject')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reject modal */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t('admin.rejectReason')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={handleReject} disabled={!reason.trim() || rejectMut.isPending}>
              {t('admin.reject')}
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted mb-2">{t('admin.rejectNotice')}</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {REASON_TYPES.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setReason(label)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${reason === label ? 'border-danger/50 bg-danger/10 text-danger' : 'border-border/50 text-muted hover:text-text'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full bg-surface2 border border-border/50 rounded-btn px-3 py-2 text-sm text-text outline-none focus:border-primary/60 resize-none"
        />
      </Modal>

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
    </div>
  )
}

function LikeButton({ post, liked }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [optimistic, setOptimistic] = useState(liked)
  const { mutate } = useMutation({
    mutationFn: () => likesApi.toggle(post.id, getPostCategory(post)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liked-posts'] })
      qc.invalidateQueries({ queryKey: ['liked-ids'] })
    },
    onError: () => setOptimistic((prev) => !prev),
  })
  return (
    <button
      onClick={() => { setOptimistic(!optimistic); mutate() }}
      className={`flex items-center gap-2 px-4 py-2 rounded-btn border text-sm font-medium transition-colors ${
        optimistic ? 'bg-primary/15 text-primary border-primary/30' : 'border-border/50 text-muted hover:text-primary hover:border-primary/40'
      }`}
    >
      <Heart size={15} fill={optimistic ? 'currentColor' : 'none'} />
      {optimistic ? t('nav.saved') : t('common.save')}
    </button>
  )
}
