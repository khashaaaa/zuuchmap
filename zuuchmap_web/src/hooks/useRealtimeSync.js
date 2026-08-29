import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore, useNotificationStore } from '@/store'
import { invalidatePostQueries } from '@/lib/queryClient'
import { playNotifySound } from '@/lib/notifySound'
import { connectSocket, disconnectSocket, destroySocket, SOCKET_EVENTS, ROOM_ADMIN, userRoom } from '@/lib/socket'

export function useRealtimeSync() {
  const { token, user, isAdmin, isLoading } = useAuthStore()
  const qc = useQueryClient()
  const { t } = useTranslation()

  useEffect(() => {
    if (!token || !user?.id) return

    const rooms = isAdmin ? [ROOM_ADMIN, userRoom(user.id)] : [userRoom(user.id)]
    const socket = connectSocket(token, rooms)

    // Handlers are collected so cleanup can off() exactly what this instance
    // registered — a bare off(event) on the shared singleton would also wipe
    // any other consumer's listeners.
    const handlers = {}
    const on = (event, fn) => { handlers[event] = fn; socket.on(event, fn) }

    // A message sent while the socket was down never reaches this client as
    // an event. Refetch the messaging reads on every *re*connect (the first
    // connect is skipped — the screens fetch on mount) so the gap closes as
    // soon as the network is back rather than on the next tab focus.
    let connectedOnce = socket.connected
    on('connect', () => {
      if (!connectedOnce) { connectedOnce = true; return }
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['messages', 'unread'] })
      qc.invalidateQueries({ queryKey: ['conversation'] })
    })

    on(SOCKET_EVENTS.POST_CREATED, ({ postId } = {}) => {
      qc.invalidateQueries({ queryKey: ['admin-pending'], refetchType: 'none' })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      useNotificationStore.getState().add({ message: t('notifications.postCreated'), kind: 'info', postId, role: 'admin' })
    })

    on(SOCKET_EVENTS.POST_APPROVED, ({ postId }) => {
      invalidatePostQueries(qc, { postId })
      if (!isAdmin) {
        playNotifySound()
        toast.success(t('admin.approveSuccess'))
        useNotificationStore.getState().add({ message: t('notifications.postApproved'), kind: 'success', postId })
      }
    })

    on(SOCKET_EVENTS.POST_REJECTED, ({ postId, reason }) => {
      invalidatePostQueries(qc, { postId })
      if (!isAdmin) {
        playNotifySound()
        toast.error(`${t('posts.rejectionReason')}: ${reason}`)
        useNotificationStore.getState().add({ message: `${t('notifications.postRejected')}: ${reason}`, kind: 'error', postId })
      }
    })

    on(SOCKET_EVENTS.STATS_UPDATED, () => {
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      if (isAdmin) useNotificationStore.getState().add({ message: t('notifications.statsUpdated'), kind: 'info' })
    })

    on(SOCKET_EVENTS.BOOKING_REQUESTED, ({ postId } = {}) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      playNotifySound()
      toast(t('notifications.bookingRequested'))
      useNotificationStore.getState().add({ message: t('notifications.bookingRequested'), kind: 'info', bookingRole: 'provider', postId, url: '/provider/bookings' })
    })

    on(SOCKET_EVENTS.BOOKING_RESPONDED, ({ status } = {}) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      playNotifySound()
      const accepted = status === 'ACCEPTED'
      const message = accepted ? t('notifications.bookingAccepted') : t('notifications.bookingDeclined')
      if (accepted) toast.success(message); else toast.error(message)
      useNotificationStore.getState().add({ message, kind: accepted ? 'success' : 'error', bookingRole: 'customer', url: '/customer/bookings' })
    })

    on(SOCKET_EVENTS.BOOKING_CANCELLED, () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      playNotifySound()
      toast(t('notifications.bookingCancelled'))
      useNotificationStore.getState().add({ message: t('notifications.bookingCancelled'), kind: 'info', bookingRole: 'provider', url: '/provider/bookings' })
    })

    on(SOCKET_EVENTS.MESSAGE_CREATED, ({ conversationId, preview } = {}) => {
      // The inbox list, the badge, and the open thread if it happens to be
      // this one — a message arriving in the thread you are reading must
      // appear without a refresh, which is most of the point of a chat.
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['messages', 'unread'] })
      if (conversationId) qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
      playNotifySound()
      toast(preview || t('messages.title'))
      useNotificationStore.getState().add({
        message: preview || t('messages.title'),
        kind: 'info',
        conversationId,
      })
    })

    on(SOCKET_EVENTS.REPORT_CREATED, ({ postId, reportId } = {}) => {
      // Admin-only by construction — the gateway emits this to the admin room.
      qc.invalidateQueries({ queryKey: ['reports'] }) // covers the queue, the count and per-post lists
      if (isAdmin) {
        playNotifySound()
        useNotificationStore.getState().add({ message: t('report.queue'), kind: 'info', postId, reportId, url: '/admin/reports' })
      }
    })

    return () => {
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn))
      disconnectSocket()
    }
  }, [token, user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Wait for `init()` to finish before treating a missing token as a sign-out.
    // The store starts with `token: null` and hydrates from localStorage after
    // mount, so clearing on the first render wiped every persisted notification
    // on every page load — the exact "refresh erased them" bug the notification
    // store was given localStorage to fix.
    if (isLoading) return
    if (!token) {
      destroySocket()
      useNotificationStore.getState().clear()
      return
    }
    // Signed in: make sure what is on disk belongs to *this* account. Clearing
    // on sign-out alone assumed every session ends with one.
    useNotificationStore.getState().scopeTo(user?.id)
  }, [token, isLoading, user?.id])
}
