import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';

const E = API_CONFIG.ENDPOINTS.CONVERSATIONS;

/** React Query keys for every messaging read; invalidate after any mutation. */
export const CONVERSATIONS_KEY = ['conversations'];
export const UNREAD_KEY = ['conversations', 'unread'];
export const threadKey = (id) => ['conversation', id];
export const messagesKey = (id) => ['conversation', id, 'messages'];

export const PAGE_SIZE = 30;
export const INBOX_PAGE_SIZE = 50;
/** Pages arrive newest-first; flatten into one chronological list. */
export const flattenMessages = (pages = []) => [...pages].reverse().flat();
export const messageCursor = (page) =>
    page.length < PAGE_SIZE ? undefined : { before: page[0].date_created, before_id: page[0].id };
export const inboxCursor = (page) => {
    if (page.length < INBOX_PAGE_SIZE) return undefined;
    const last = page[page.length - 1];
    return { before: last.last_message_at || last.date_created, before_id: last.id };
};

/**
 * In-app messaging.
 *
 * Before this, reaching a provider meant a phone number revealed only after a
 * booking was accepted — so "is this still available", the question customers
 * actually have, had no answer inside the product, and nothing that was agreed
 * left a record.
 */
const messageService = {
    /** `before` is a cursor on the thread's last activity; 50 per page. */
    list: async (cursor) =>
        (await apiClient.get(E.LIST, {
            params: cursor ? { before: cursor.before, before_id: cursor.before_id } : undefined,
        })).data ?? [],

    unreadCount: async () => (await apiClient.get(E.UNREAD_COUNT)).data?.unread ?? 0,

    /** Idempotent — the server hands back the existing thread for a repeat tap. */
    open: async (postId, body) =>
        (await apiClient.post(E.OPEN, { post_id: postId, ...(body ? { body } : {}) })).data,

    detail: async (id) => (await apiClient.get(E.DETAIL(id))).data,

    /**
     * `cursor` is `{ before, before_id }` on `(date_created, id)`, not an
     * offset: every new message shifts an offset's page boundary, so scrolling
     * back while the other side is typing skips or repeats rows.
     */
    history: async (id, cursor) =>
        (await apiClient.get(E.MESSAGES(id), {
            params: cursor ? { before: cursor.before, before_id: cursor.before_id } : undefined,
        })).data ?? [],

    send: async (id, body) => (await apiClient.post(E.SEND(id), { body })).data,

    /** Clears the caller's own side. Idempotent — called on every thread open. */
    markRead: async (id) => (await apiClient.put(E.READ(id))).data,
};

export default messageService;
