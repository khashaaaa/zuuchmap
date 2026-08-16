import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

class CacheManager {
    constructor() {
        this.memoryCache = new Map();
        this.storagePrefix = 'app_cache_';
    }

    getMemory(key) {
        const entry = this.memoryCache.get(key);
        if (!entry) return null;
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
            this.memoryCache.delete(key);
            return null;
        }
        return entry.value;
    }

    setMemory(key, value, ttl = null) {
        this.memoryCache.set(key, {
            value,
            expiresAt: ttl ? Date.now() + ttl : null,
        });
    }

    hasMemory(key) {
        return this.getMemory(key) !== null;
    }

    deleteMemory(key) {
        this.memoryCache.delete(key);
    }

    clearMemory() {
        this.memoryCache.clear();
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

    async clearStorage() {
        try {
            const keys = await AsyncStorage.getAllKeys();
            const cacheKeys = keys.filter(key => key.startsWith(this.storagePrefix));
            await AsyncStorage.multiRemove(cacheKeys);
        } catch (error) {
        }
    }

    async get(key, ttl = null) {
        const memoryValue = this.getMemory(key);
        if (memoryValue !== null) return memoryValue;
        const storageValue = await this.getStorage(key);
        if (storageValue !== null) {
            // Warm memory from storage
            this.setMemory(key, storageValue, ttl);
        }
        return storageValue;
    }

    async set(key, value, ttl = null) {
        this.setMemory(key, value, ttl);
        await this.setStorage(key, value, ttl);
    }

    async delete(key) {
        this.deleteMemory(key);
        await this.deleteStorage(key);
    }

    async clear() {
        this.clearMemory();
        await this.clearStorage();
    }
}

const cacheManager = new CacheManager();
export default cacheManager;

// Clears the AsyncStorage-backed offline fallbacks (map posts). React Query owns all
// screen-level caching — invalidate through services/queryClient.invalidatePostData().
export const invalidatePostCaches = async () => {
    try {
        cacheManager.clearMemory();
        await cacheManager.deleteStorage('cached_map_posts');
    } catch (error) {
        logger.error('Error invalidating post caches:', error);
    }
};
