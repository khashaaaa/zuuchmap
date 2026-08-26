import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';

const E = API_CONFIG.ENDPOINTS.REPORTS;

export const REPORTS_KEY = ['reports'];

/**
 * The closed reason list, mirrored from the engine's `REPORT_REASONS`.
 *
 * Kept here as well as fetched so the sheet can render instantly on a slow
 * connection; `reasons()` is the authority when the two ever disagree. Labels
 * are translated client-side under `report.reasons.<KEY>`.
 */
export const REPORT_REASONS = ['SPAM', 'SCAM', 'WRONG_INFO', 'UNAVAILABLE', 'OFFENSIVE', 'OTHER'];

/**
 * Flagging a listing that is already live.
 *
 * Moderation was pre-approval only: an admin sees a listing once, and anything
 * that goes wrong afterwards stays up until someone happens to look.
 */
const reportService = {
    reasons: async () => (await apiClient.get(E.REASONS)).data ?? REPORT_REASONS,

    create: async (postId, reason, detail) =>
        (await apiClient.post(E.CREATE, { post_id: postId, reason, ...(detail ? { detail } : {}) })).data,

    list: async (params) => (await apiClient.get(E.LIST, { params })).data,

    countOpen: async () => (await apiClient.get(E.COUNT)).data?.open ?? 0,

    resolve: async (id, status, resolution) =>
        (await apiClient.put(E.RESOLVE(id), { status, ...(resolution ? { resolution } : {}) })).data,
};

export default reportService;
