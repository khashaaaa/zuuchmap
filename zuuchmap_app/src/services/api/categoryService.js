import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';
import cacheManager from '../../utils/cacheManager';
import { logger } from '../../utils/logger';

const STORAGE_KEY = API_CONFIG.STORAGE_KEYS.CATEGORY_SCHEMAS;
const CACHE_DURATION = API_CONFIG.CACHE.CATEGORY_SCHEMAS_DURATION;
const MEM_KEY = 'category_schemas';

const categoryService = {
  getCategories: async (forceRefresh = false) => {
    if (!forceRefresh) {
      const mem = cacheManager.getMemory(MEM_KEY);
      if (mem) return mem;

      const stored = await cacheManager.getStorage(STORAGE_KEY).catch(() => null);
      if (stored?.length) {
        cacheManager.setMemory(MEM_KEY, stored, CACHE_DURATION);
        return stored;
      }
    }

    try {
      const response = await apiClient.get(API_CONFIG.ENDPOINTS.POSTS.CATEGORIES);
      const schemas = Array.isArray(response.data) ? response.data : [];
      cacheManager.setMemory(MEM_KEY, schemas, CACHE_DURATION);
      await cacheManager.setStorage(STORAGE_KEY, schemas, CACHE_DURATION).catch(() => {});
      return schemas;
    } catch (error) {
      logger.error('Failed to fetch categories:', error);
      return cacheManager.getMemory(MEM_KEY) || [];
    }
  },

  getCategoryByKey: async (key) => {
    const cats = await categoryService.getCategories();
    return cats.find(c => c.key === key) || null;
  },

  clearCache: () => {
    cacheManager.deleteMemory(MEM_KEY);
    cacheManager.deleteStorage(STORAGE_KEY).catch(() => {});
  },
};

export default categoryService;
