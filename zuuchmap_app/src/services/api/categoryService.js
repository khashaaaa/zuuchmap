import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';
import cacheManager from '../../utils/cacheManager';
import { logger } from '../../utils/logger';

const STORAGE_KEY = API_CONFIG.STORAGE_KEYS.CATEGORY_SCHEMAS;
const CACHE_DURATION = API_CONFIG.CACHE.CATEGORY_SCHEMAS_DURATION;

const categoryService = {
  getCategories: async (forceRefresh = false) => {
    // React Query is the in-memory tier; AsyncStorage is only the offline fallback.
    if (!forceRefresh) {
      const stored = await cacheManager.getStorage(STORAGE_KEY).catch(() => null);
      if (stored?.length) return stored;
    }

    try {
      const response = await apiClient.get(API_CONFIG.ENDPOINTS.POSTS.CATEGORIES);
      const schemas = Array.isArray(response.data) ? response.data : [];
      await cacheManager.setStorage(STORAGE_KEY, schemas, CACHE_DURATION).catch(() => {});
      return schemas;
    } catch (error) {
      logger.error('Failed to fetch categories:', error);
      // Offline: fall back to disk, so a forced refresh never leaves the UI
      // with no categories at all.
      const stored = await cacheManager.getStorage(STORAGE_KEY).catch(() => null);
      return stored?.length ? stored : [];
    }
  },

  getCategoryByKey: async (key) => {
    const cats = await categoryService.getCategories();
    return cats.find(c => c.key === key) || null;
  },
};

export default categoryService;
