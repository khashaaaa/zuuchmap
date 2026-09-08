import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';

const { ADMIN, ANALYTICS } = API_CONFIG.ENDPOINTS;

/**
 * Account administration and the analytics summary.
 *
 * Post moderation lives in `postService` (it shares that module's caches); this
 * covers the two admin surfaces the app was missing entirely — every one of
 * these endpoints existed and had a web caller but no mobile one, so an admin
 * away from a desk could approve a listing and nothing else.
 *
 * All are behind JwtAuthGuard + AdminGuard server-side. The client-side `is_admin`
 * that decides whether to show the tabs is a convenience, never the gate.
 */
const adminService = {
  /** Every account. Returns an array — not the {items,total} shape /posts uses. */
  listUsers: async () => {
    const { data } = await apiClient.get(ADMIN.USERS);
    return Array.isArray(data) ? data : [];
  },

  /** One account, with the profileSummary fields the list does not carry. */
  getUser: async (id) => {
    const { data } = await apiClient.get(ADMIN.USER(id));
    return data;
  },

  deleteUser: async (id) => {
    const { data } = await apiClient.delete(ADMIN.DELETE_USER(id));
    return data;
  },

  /**
   * Grant a plan. Phase 1 fulfils subscriptions by hand, so this is a grant and
   * not a purchase. `months` is 1–24 server-side, and renewing early extends
   * from the existing expiry rather than burning what is left of it.
   */
  setPlan: async (id, plan, months = 1) => {
    const { data } = await apiClient.put(ADMIN.SET_PLAN(id), { plan, months });
    return data;
  },

  /** Rolling-window analytics. `days` is clamped to 1–365 server-side. */
  summary: async (days = 30) => {
    const { data } = await apiClient.get(ANALYTICS.SUMMARY, { params: { days } });
    return data;
  },
};

export default adminService;
