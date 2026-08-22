import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore, useNotificationStore } from '@/store'
import { connectSocket, disconnectSocket, destroySocket, SOCKET_EVENTS, ROOM_ADMIN, userRoom } from '@/lib/socket'

export function useRealtimeSync() {
  const { token, user, isAdmin } = useAuthStore()
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

    on(SOCKET_EVENTS.POST_CREATED, () => {
      qc.invalidateQueries({ queryKey: ['admin-pending'], refetchType: 'none' })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      useNotificationStore.getState().add({ message: t('notifications.postCreated') })
    })

    on(SOCKET_EVENTS.POST_APPROVED, ({ postId }) => {
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['my-posts'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['posts-map'] })
      qc.invalidateQueries({ queryKey: ['public-stats'] })
      if (postId) qc.invalidateQueries({ queryKey: ['post', String(postId)] })
      if (!isAdmin) {
        toast.success(t('admin.approveSuccess'))
        useNotificationStore.getState().add({ message: t('notifications.postApproved') })
      }
    })

    on(SOCKET_EVENTS.POST_REJECTED, ({ postId, reason }) => {
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['my-posts'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['posts-map'] })
      if (postId) qc.invalidateQueries({ queryKey: ['post', String(postId)] })
      if (!isAdmin) {
        toast.error(`${t('posts.rejectionReason')}: ${reason}`)
        useNotificationStore.getState().add({ message: `${t('notifications.postRejected')}: ${reason}` })
      }
    })

    on(SOCKET_EVENTS.STATS_UPDATED, () => {
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      if (isAdmin) useNotificationStore.getState().add({ message: t('notifications.statsUpdated') })
    })

    on(SOCKET_EVENTS.BOOKING_REQUESTED, () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      toast(t('notifications.bookingRequested'))
      useNotificationStore.getState().add({ message: t('notifications.bookingRequested') })
    })

    on(SOCKET_EVENTS.BOOKING_RESPONDED, ({ status }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      const accepted = status === 'ACCEPTED'
      const message = accepted ? t('notifications.bookingAccepted') : t('notifications.bookingDeclined')
      if (accepted) toast.success(message); else toast.error(message)
      useNotificationStore.getState().add({ message })
    })

    on(SOCKET_EVENTS.BOOKING_CANCELLED, () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      toast(t('notifications.bookingCancelled'))
      useNotificationStore.getState().add({ message: t('notifications.bookingCancelled') })
    })

    return () => {
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn))
      disconnectSocket()
    }
  }, [token, user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) {
      destroySocket()
      useNotificationStore.getState().clear()
    }
  }, [token])
}
