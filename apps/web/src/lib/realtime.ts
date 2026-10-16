import { useEffect } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { notificationCopy, SOCKET_EVENTS, type AppNotification, type ConversationReadPayload, type Message, type MessageCreatedPayload } from '@zuuchmap/core';
import i18n from '@/i18n';
import { API_URL } from './api';
import { useAuthStore } from './auth';
import { upsertNotification } from './notifications';
import { useToast } from './toast';

/** The engine origin: the API url without `/api`. */
const socketOrigin = (): string => new URL(API_URL, window.location.href).origin;

/**
 * The one socket of a signed-in session. Each event patches or invalidates the Чат and booking
 * caches; sign-out (the token going away) tears it down.
 */
export function useRealtime(): void {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    if (!token) return;
    const socket = io(socketOrigin(), { transports: ['websocket'], auth: { token } });
    const refresh = (...keys: string[]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

    socket.on(SOCKET_EVENTS.MESSAGE_CREATED, ({ conversation_id, message }: MessageCreatedPayload) => {
      qc.setQueryData<InfiniteData<Message[], unknown>>(['thread', conversation_id], (d) =>
        d && !d.pages.some((p) => p.some((m) => m.id === message.id)) ? { ...d, pages: [[message, ...(d.pages[0] ?? [])], ...d.pages.slice(1)] } : d,
      );
      refresh('conversations', 'conversation', 'badges');
    });
    socket.on(SOCKET_EVENTS.CONVERSATION_READ, ({ conversation_id, read_at }: ConversationReadPayload) => {
      const me = useAuthStore.getState().user?.id;
      qc.setQueryData<InfiniteData<Message[], unknown>>(['thread', conversation_id], (d) =>
        d && { ...d, pages: d.pages.map((p) => p.map((m) => (m.sender_id === me && !m.read_at ? { ...m, read_at } : m))) },
      );
      refresh('conversations');
    });
    socket.on(SOCKET_EVENTS.BOOKING_UPDATED, () => refresh('bookings', 'availability', 'reviews'));
    socket.on(SOCKET_EVENTS.NOTIFICATION_CREATED, (n: AppNotification) => {
      qc.setQueryData<InfiniteData<AppNotification[], unknown>>(['notifications', 'list', token], (d) => upsertNotification(d, n));
      refresh('notifications', 'badges');
      // Only what matters while a page is open: a booking asked for or answered. Чат shows its own messages.
      if (n.kind === 'BOOKING_REQUESTED' || n.kind === 'BOOKING_ACCEPTED') toast.info(notificationCopy(n, (k, o) => i18n.t(k, o) as string).body);
    });
    // A dropped socket may have missed events: everything the events feed is read again.
    socket.io.on('reconnect', () => refresh('notifications', 'badges', 'conversations', 'conversation', 'bookings'));

    return () => {
      socket.disconnect();
    };
  }, [token, qc, toast]);
}
