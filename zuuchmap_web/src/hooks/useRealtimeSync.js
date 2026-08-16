import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore, useNotificationStore } from '@/store'
import { connectSocket, disconnectSocket, destroySocket } from '@/lib/socket'

export function useRealtimeSync() {
  const { token, user, isAdmin } = useAuthStore()
  const qc = useQueryClient()
  const { t } = useTranslation()

  useEffect(() => {
    if (!token || !user?.id) return

    const socket = connectSocket(token)
    if (isAdmin) socket.emit('join', 'admin')
    socket.emit('join', `provider:${user.id}`)

    socket.on('post.created', () => {
      qc.invalidateQueries({ queryKey: ['admin-pending'], refetchType: 'none' })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      useNotificationStore.getState().add({ message: t('notifications.postCreated') })
    })

    socket.on('post.approved', ({ postId }) => {
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['my-posts'] })
      if (postId) qc.invalidateQueries({ queryKey: ['post', String(postId)] })
      if (!isAdmin) {
        toast.success(t('admin.approveSuccess'))
        useNotificationStore.getState().add({ message: t('notifications.postApproved') })
      }
    })

    socket.on('post.rejected', ({ postId, reason }) => {
      qc.invalidateQueries({ queryKey: ['admin-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['my-posts'] })
      if (postId) qc.invalidateQueries({ queryKey: ['post', String(postId)] })
      if (!isAdmin) {
        toast.error(`${t('posts.rejectionReason')}: ${reason}`)
        useNotificationStore.getState().add({ message: `${t('notifications.postRejected')}: ${reason}` })
      }
    })

    socket.on('stats.updated', () => {
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      if (isAdmin) useNotificationStore.getState().add({ message: t('notifications.statsUpdated') })
    })

    socket.on('booking.requested', () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      toast(t('notifications.bookingRequested'))
      useNotificationStore.getState().add({ message: t('notifications.bookingRequested') })
    })

    socket.on('booking.responded', ({ status }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      const accepted = status === 'ACCEPTED'
      const message = accepted ? t('notifications.bookingAccepted') : t('notifications.bookingDeclined')
      if (accepted) toast.success(message); else toast.error(message)
      useNotificationStore.getState().add({ message })
    })

    socket.on('booking.cancelled', () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      toast(t('notifications.bookingCancelled'))
      useNotificationStore.getState().add({ message: t('notifications.bookingCancelled') })
    })

    return () => {
      socket.off('post.created')
      socket.off('post.approved')
      socket.off('post.rejected')
      socket.off('stats.updated')
      socket.off('booking.requested')
      socket.off('booking.responded')
      socket.off('booking.cancelled')
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
