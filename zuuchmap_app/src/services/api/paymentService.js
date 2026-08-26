import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';

const E = API_CONFIG.ENDPOINTS.PAYMENTS;

export const CATALOGUE_KEY = ['payments', 'catalogue'];
export const PAYMENTS_KEY = ['payments', 'mine'];

/**
 * Buying plan time.
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
        (await apiClient.post(E.INVOICE, { plan, months })).data,

    check: async (id) => (await apiClient.get(E.CHECK(id))).data,

    mine: async () => (await apiClient.get(E.MINE)).data ?? [],

    /** True when the engine has no QPay credentials — show "unavailable", not an error. */
    isNotConfigured: (error) => {
        const d = error?.response?.data;
        return d?.message === 'PAYMENTS_NOT_CONFIGURED' || d?.code === 'PAYMENTS_NOT_CONFIGURED';
    },
};

export default paymentService;
