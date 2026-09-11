import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';

const E = API_CONFIG.ENDPOINTS.PAYMENTS;

export const CATALOGUE_KEY = ['payments', 'catalogue'];
export const PAYMENTS_KEY = ['payments', 'mine'];

/**
 * Buying plan time, and featured placement.
 *
 * The plan has been enforced server-side all along — quota, expiry, degrade on
 * lapse — but the only way into it was an admin toggling a flag after
 * reconciling a bank transfer by hand.
 *
 * Nothing here decides whether money moved. `check` reads an answer the engine
 * has already verified with QPay server-to-server; the client only polls it.
 */
const paymentService = {
    catalogue: async () => (await apiClient.get(E.CATALOGUE)).data,

    createInvoice: async (plan, months = 1) =>
        (await apiClient.post(E.INVOICE, { kind: 'PLAN', plan, months })).data,

    /**
     * Days of featured placement on one listing.
     *
     * The engine clamps the window to what the listing has left, so the reply
     * is the authority on what was bought — render `days` and `amount` from it
     * rather than from the number that was asked for.
     */
    createFeaturedInvoice: async (postId, days) =>
        (await apiClient.post(E.INVOICE, { kind: 'FEATURED', post_id: postId, days })).data,

    check: async (id) => (await apiClient.get(E.CHECK(id))).data,

    mine: async () => (await apiClient.get(E.MINE)).data ?? [],

    /** True when the engine has no QPay credentials — show "unavailable", not an error. */
    isNotConfigured: (error) => {
        const d = error?.response?.data;
        const code = d?.message ?? d?.code;
        // An unset placement price is the same shape of problem to a provider:
        // nothing is broken, the thing is simply not on sale yet.
        return code === 'PAYMENTS_NOT_CONFIGURED' || code === 'FEATURED_PRICE_NOT_SET';
    },
};

export default paymentService;
