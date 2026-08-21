import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Phone, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import { bookingsApi } from '@/lib/api'
import { formatDate, getImageUrl, getPostTitle, apiErrorMessage } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import UserAvatar from '@/components/UserAvatar'
import Input from '@/components/Input'
import Button from '@/components/Button'
import StatusBadge from '@/components/StatusBadge'
import ConfirmModal from '@/components/ConfirmModal'
import TabBar from '@/components/TabBar'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'

const TAB_STATUSES = {
  pending: ['PENDING'],
  upcoming: ['ACCEPTED'],
  history: ['DECLINED', 'CANCELLED'],
}

function BookingCard({ booking, mode, onAccept, onDecline, onRequestCancel, busy, t }) {
  const [respondingTo, setRespondingTo] = useState(null) // 'decline' | null
  const [message, setMessage] = useState('')
  const other = mode === 'provider' ? booking.customer : booking.provider
  const isPending = booking.status === 'PENDING'
  const canCancel = mode === 'customer' && (booking.status === 'PENDING' || booking.status === 'ACCEPTED')

  return (
    <div className="bg-surface border border-border/20 shadow-card rounded-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        {booking.post?.images?.[0] && (
          <Link to={`/posts/${booking.post.id}`} className="shrink-0">
            <img src={getImageUrl(booking.post.images[0])} alt="" className="w-14 h-14 rounded-lg object-cover" />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/posts/${booking.post?.id}`} className="text-sm font-semibold text-text hover:text-primary-text transition-colors line-clamp-1">
            {getPostTitle(booking.post, t)}
          </Link>
          <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
            <CalendarRange size={12} /> {formatDate(booking.start_date)} — {formatDate(booking.end_date)}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <UserAvatar src={other?.profile_picture} name={other?.given_name} size="sm" />
            <span className="text-xs text-text">{other?.given_name || '—'}</span>
            {other?.phone_number && (
              <a href={`tel:${other.phone_number}`} className="flex items-center gap-1 text-xs text-primary-text">
                <Phone size={11} /> {other.phone_number}
              </a>
            )}
          </div>
        </div>
        <span className="shrink-0"><StatusBadge status={booking.status} /></span>
      </div>

      {booking.message && <p className="text-xs text-muted bg-surface2 rounded-lg p-2.5">{booking.message}</p>}
      {booking.response_message && (
        <p className="text-xs text-muted bg-surface2 rounded-lg p-2.5">
          <span className="font-medium">{t('booking.responseMessage')}:</span> {booking.response_message}
        </p>
      )}

      {mode === 'provider' && isPending && (
        respondingTo === 'decline' ? (
          <div className="space-y-2">
            <Input as="textarea" rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={t('booking.responseMessage')} className="resize-none" />
            <div className="flex gap-2">
              <button onClick={() => onDecline(booking.id, message)} disabled={busy}
                className="px-3 py-1.5 bg-danger text-on-color rounded-btn text-xs font-semibold disabled:opacity-50 hover:bg-danger/90 transition-colors">
                {t('booking.decline')}
              </button>
              <Button variant="secondary" size="sm" onClick={() => setRespondingTo(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => onAccept(booking.id)} disabled={busy}
              className="px-4 py-1.5 bg-success text-on-color rounded-btn text-xs font-semibold disabled:opacity-50 hover:bg-success/90 transition-colors">
              {t('booking.accept')}
            </button>
            <button onClick={() => setRespondingTo('decline')} disabled={busy}
              className="px-4 py-1.5 border border-danger/40 text-danger rounded-btn text-xs font-semibold disabled:opacity-50 hover:bg-danger/10 transition-colors">
              {t('booking.decline')}
            </button>
          </div>
        )
      )}

      {canCancel && (
        <button onClick={() => onRequestCancel(booking.id)} disabled={busy}
          className="px-4 py-1.5 border border-border/50 text-muted rounded-btn text-xs font-semibold disabled:opacity-50 hover:text-danger hover:border-danger/40 transition-colors">
          {t('booking.cancel')}
        </button>
      )}
    </div>
  )
}

export default function Bookings({ mode }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [confirmCancelId, setConfirmCancelId] = useState(null)
  const [tab, setTab] = useState('pending')

  const { data: bookings = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['bookings', mode],
    queryFn: () => (mode === 'provider' ? bookingsApi.received() : bookingsApi.mine()),
    staleTime: 30_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bookings'] })
  const onError = (e) => toast.error(apiErrorMessage(e, t, t('common.error')))

  const acceptMut = useMutation({
    mutationFn: (id) => bookingsApi.accept(id),
    onSuccess: () => { invalidate(); toast.success(t('booking.acceptSuccess')) },
    onError,
  })
  const declineMut = useMutation({
    mutationFn: ({ id, message }) => bookingsApi.decline(id, message),
    onSuccess: () => { invalidate(); toast.success(t('booking.declineSuccess')) },
    onError,
  })
  const cancelMut = useMutation({
    mutationFn: (id) => bookingsApi.cancel(id),
    onSuccess: () => { invalidate(); toast.success(t('booking.cancelSuccess')) },
    onError,
  })
  // Scope the pending state to the booking being acted on — a page-wide flag
  // would freeze every card while one request is in flight.
  const busyId =
    (acceptMut.isPending && acceptMut.variables) ||
    (declineMut.isPending && declineMut.variables?.id) ||
    (cancelMut.isPending && cancelMut.variables) ||
    null

  const showSkeleton = useMinDisplayTime(isLoading)

  const counts = Object.fromEntries(
    Object.entries(TAB_STATUSES).map(([key, statuses]) => [key, bookings.filter((b) => statuses.includes(b.status)).length])
  )
  const filtered = bookings.filter((b) => TAB_STATUSES[tab].includes(b.status))

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t(mode === 'provider' ? 'booking.receivedBookings' : 'booking.myBookings')}
        description={t('common.total', { count: bookings.length })}
      />
      {!showSkeleton && bookings.length > 0 && (
        <TabBar
          tabs={[
            { key: 'pending', label: `${t('booking.pending')} (${counts.pending})` },
            { key: 'upcoming', label: `${t('booking.upcoming')} (${counts.upcoming})` },
            { key: 'history', label: `${t('booking.history')} (${counts.history})` },
          ]}
          value={tab}
          onChange={setTab}
          className="mb-4"
        />
      )}
      {showSkeleton ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-surface2 rounded-card animate-pulse" />)}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : bookings.length === 0 ? (
        <EmptyState title={t('booking.empty')} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('booking.empty')} />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              mode={mode}
              busy={busyId === b.id}
              onAccept={(id) => acceptMut.mutate(id)}
              onDecline={(id, message) => declineMut.mutate({ id, message })}
              onRequestCancel={(id) => setConfirmCancelId(id)}
              t={t}
            />
          ))}
        </div>
      )}
      <ConfirmModal
        open={Boolean(confirmCancelId)}
        onClose={() => setConfirmCancelId(null)}
        title={t('booking.cancelConfirmTitle')}
        message={t('booking.cancelConfirmMessage')}
        confirmLabel={t('booking.cancel')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { cancelMut.mutate(confirmCancelId); setConfirmCancelId(null) }}
        isPending={cancelMut.isPending}
      />
    </div>
  )
}
