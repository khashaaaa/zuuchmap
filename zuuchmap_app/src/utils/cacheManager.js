import { API_CONFIG } from '../config/api.config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

class CacheManager {
    constructor() {
        this.storagePrefix = 'app_cache_';
    }

    async getStorage(key) {
        try {
            const fullKey = `${this.storagePrefix}${key}`;
            const data = await AsyncStorage.getItem(fullKey);
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
                    await this.deleteStorage(key);
                    return null;
                }
                return parsed.value;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async setStorage(key, value, ttl = null) {
        try {
            const fullKey = `${this.storagePrefix}${key}`;
            const data = {
                value,
                expiresAt: ttl ? Date.now() + ttl : null,
            };
            await AsyncStorage.setItem(fullKey, JSON.stringify(data));
        } catch (error) {
        }
    }

    async deleteStorage(key) {
        try {
            const fullKey = `${this.storagePrefix}${key}`;
            await AsyncStorage.removeItem(fullKey);
        } catch (error) {
        }
    }

}

const cacheManager = new CacheManager();
export default cacheManager;

// Clears the AsyncStorage-backed offline fallback for map posts. React Query owns all
// screen-level (and in-memory) caching — invalidate through services/queryClient.invalidatePostData().
export const invalidatePostCaches = async () => {
    try {
        await cacheManager.deleteStorage(API_CONFIG.STORAGE_KEYS.CACHED_MAP_POSTS);
    } catch (error) {
        logger.error('Error invalidating post caches:', error);
    }
};
