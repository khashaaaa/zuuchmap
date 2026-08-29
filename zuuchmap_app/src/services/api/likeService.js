import { API_CONFIG } from '../../config/api.config';
import apiClient from './apiClient';
import { logger } from '../../utils/logger';

// 401/403 are not swallowed here: apiClient clears the session on 401 and the
// React Query client refuses to retry either, so callers see the real answer.
const likeService = {
    toggleLike: (post_type, post_id, currently_liked) =>
        currently_liked
            ? apiClient.delete(API_CONFIG.ENDPOINTS.LIKE.UNLIKE(post_type, post_id))
            : apiClient.post(API_CONFIG.ENDPOINTS.LIKE.LIKE, { post_type, post_id }),

    checkIfLiked: async (post_type, post_id) => {
        const response = await apiClient.get(API_CONFIG.ENDPOINTS.LIKE.CHECK(post_type, post_id));
        return response.data.is_liked === true;
    },

    getUserLikedPosts: (page = 1, limit = 20) =>
        apiClient.get(`${API_CONFIG.ENDPOINTS.LIKE.LIST}?page=${page}&limit=${limit}`),

    getLikeStats: async (post_type, post_id) => {
        const response = await apiClient.get(API_CONFIG.ENDPOINTS.LIKE.GET_STATS(post_type, post_id));
        return response.data ?? { total_likes: 0, recent_likes: 0 };
    },

    /**
     * Every liked id the user has, keyed by post_type — one request, whatever is
     * on screen. This used to fan out one request per category in the visible
     * list and refire on every page of an infinite scroll, even though the
     * answer never depended on the page.
     */
    likedIdsByType: async () => {
        try {
            const response = await apiClient.get(API_CONFIG.ENDPOINTS.LIKE.GET_IDS);
            return response.data.liked_by_type ?? {};
        } catch (error) {
            // Lists render for anonymous users too; no ids is the right answer.
            if (error.response?.status !== 401 && error.response?.status !== 403) logger.error('Liked ids error:', error);
            return {};
        }
    },

    /** Flattens the grouped ids into the `${post_type}-${id}` map screens render from. */
    likedStatusMap: (likedByType) => {
        const map = {};
        for (const [post_type, ids] of Object.entries(likedByType ?? {})) {
            for (const id of ids) map[`${post_type}-${id}`] = true;
        }
        return map;
    },

    getLikedPostsCountSilently: async () => {
        try {
            const response = await apiClient.get(`${API_CONFIG.ENDPOINTS.LIKE.LIST}?page=1&limit=1`);
            return response.data.total || 0;
        } catch (error) {
            return 0;
        }
    }
};

export default likeService;
