import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';

const E = API_CONFIG.ENDPOINTS.SAVED_SEARCHES;

// React Query key for every saved-search read; invalidate after any mutation.
export const SAVED_SEARCHES_KEY = ['savedSearches'];

// Strips empty filter values so the stored search mirrors the /posts query
// exactly (empty string ≠ "any" server-side).
const clean = (filters = {}) => {
    const out = {};
    for (const k of ['category', 'subcategory', 'province', 'district', 'q']) {
        const v = filters[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = String(v).trim();
    }
    const attrs = filters.attrs && typeof filters.attrs === 'object'
        ? Object.fromEntries(Object.entries(filters.attrs).filter(([, v]) => v !== undefined && v !== null && v !== ''))
        : null;
    if (attrs && Object.keys(attrs).length) out.attrs = attrs;
    return out;
};

const savedSearchService = {
    list: async () => (await apiClient.get(E.LIST)).data ?? [],
    create: async ({ name, ...filters }) => (await apiClient.post(E.CREATE, { name, ...clean(filters) })).data,
    remove: async (id) => (await apiClient.delete(E.DELETE(id))).data,
    /** True when the engine refused because the per-user cap (10) is reached. */
    isLimitError: (error) => {
        const d = error?.response?.data;
        return error?.response?.status === 400 && (d?.code === 'SAVED_SEARCH_LIMIT' || d?.message?.code === 'SAVED_SEARCH_LIMIT');
    },
    /** Route params for CustomerPostList that re-apply a saved search. */
    toRouteParams: (s) => ({
        category: s.category || undefined,
        subcategory: s.subcategory || undefined,
        province: s.province || undefined,
        district: s.district || undefined,
        q: s.q || undefined,
        attrs: s.attrs || undefined,
    }),
};

export default savedSearchService;
