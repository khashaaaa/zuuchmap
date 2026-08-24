import { API_CONFIG } from '../../config/api.config';
import apiClient from './apiClient';
import { logger } from '../../utils/logger';

const likeService = {
    likePost: async (post_type, post_id) => {
        try {
            return await apiClient.post(API_CONFIG.ENDPOINTS.LIKE.LIKE, { post_type, post_id });
        } catch (error) {
            if (error.response?.status !== 401 && error.response?.status !== 403) {
                logger.error('Like post error:', error);
            }
            throw error;
        }
    },

    unlikePost: async (post_type, post_id) => {
        try {
            return await apiClient.delete(API_CONFIG.ENDPOINTS.LIKE.UNLIKE(post_type, post_id));
        } catch (error) {
            if (error.response?.status !== 401 && error.response?.status !== 403) {
                logger.error('Unlike post error:', error);
            }
            throw error;
        }
    },

    toggleLike: async (post_type, post_id, currently_liked) => {
        if (currently_liked) {
            return await likeService.unlikePost(post_type, post_id);
        } else {
            return await likeService.likePost(post_type, post_id);
        }
    },

    checkIfLiked: async (post_type, post_id) => {
        try {
            const response = await apiClient.get(API_CONFIG.ENDPOINTS.LIKE.CHECK(post_type, post_id));
            return response.data.is_liked;
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                return false;
            }
            logger.error('Check like status error:', error);
            return false;
        }
    },

    getUserLikedPosts: async (page = 1, limit = 20) => {
        try {
            return await apiClient.get(`${API_CONFIG.ENDPOINTS.LIKE.LIST}?page=${page}&limit=${limit}`);
        } catch (error) {
            if (error.response?.status !== 401 && error.response?.status !== 403) {
                logger.error('Get liked posts error:', error);
            }
            throw error;
        }
    },

    getLikedPostIds: async (post_type) => {
        try {
            const response = await apiClient.get(`${API_CONFIG.ENDPOINTS.LIKE.GET_IDS}?post_type=${post_type}`);
            return response.data.liked_post_ids;
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                return [];
            }
            logger.error('Get liked post IDs error:', error);
            return [];
        }
    },

    getLikeStats: async (post_type, post_id) => {
        try {
            const response = await apiClient.get(API_CONFIG.ENDPOINTS.LIKE.GET_STATS(post_type, post_id));
            return response.data;
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                return { total_likes: 0, recent_likes: 0 };
            }
            logger.error('Get like stats error:', error);
            return { total_likes: 0, recent_likes: 0 };
        }
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
            if (error.response?.status === 401 || error.response?.status === 403) return {};
            logger.error('Liked ids error:', error);
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