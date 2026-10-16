import { useEffect } from 'react';
import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  SOCKET_EVENTS, type ConversationReadPayload, type Message, type MessageCreatedPayload, type NotificationCreatedPayload,
} from '@zuuchmap/core';
import { API_URL } from './api';
import { getAuth, useAuth } from './auth';
import { DEAL_KEYS } from './deal';
import { isThreadOpen, upsertNotification } from './notifications';
import { presentLocal } from './push';

type Pages = InfiniteData<Message[], unknown>;

/** The engine origin: the API url without its `/api` prefix. */
const ORIGIN = API_URL.replace(/\/api\/?$/, '');

/** A message that has just arrived (or been sent) goes on the front of the first page, once. */
export function pushMessage(qc: QueryClient, m: Message): void {
  qc.setQueryData<Pages>(['messages', m.conversation_id], (old) => {
    if (!old) return old;
    if (old.pages.some((p) => p.some((x) => x.id === m.id))) return old;
    return { ...old, pages: [[m, ...(old.pages[0] ?? [])], ...old.pages.slice(1)] };
  });
}

/** One socket per signed-in session, created here and nowhere else; it patches the React Query caches. */
export function useRealtime(): void {
  const { token } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!token) return;
    const socket = io(ORIGIN, { transports: ['websocket'], auth: { token } });

    socket.on(SOCKET_EVENTS.MESSAGE_CREATED, (p: MessageCreatedPayload) => {
      pushMessage(qc, p.message);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['badges'] });
      // A message for a thread that is not on screen is announced like a push (Чат keeps its own unread, never the centre).
      const m = p.message;
      if (m.kind === 'TEXT' && m.sender_id !== getAuth().user?.id && !isThreadOpen(m.conversation_id)) {
        void presentLocal({ id: m.id, kind: 'MESSAGE_CREATED', data: { conversation_id: m.conversation_id, preview: m.body } });
      }
    });
    socket.on(SOCKET_EVENTS.NOTIFICATION_CREATED, (n: NotificationCreatedPayload) => {
      upsertNotification(qc, n);
      void presentLocal(n);
    });
    socket.on(SOCKET_EVENTS.CONVERSATION_READ, (p: ConversationReadPayload) => {
      // The other side read my messages.
      qc.setQueryData<Pages>(['messages', p.conversation_id], (old) =>
        old ? { ...old, pages: old.pages.map((pg) => pg.map((m) => (m.read_at ? m : { ...m, read_at: p.read_at }))) } : old,
      );
    });
    socket.on(SOCKET_EVENTS.BOOKING_UPDATED, () => {
      for (const k of DEAL_KEYS) void qc.invalidateQueries({ queryKey: [k] });
    });
    // A reconnect may have missed events.
    socket.io.on('reconnect', () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['badges'] });
      void qc.invalidateQueries({ queryKey: ['messages'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, qc]);
}
