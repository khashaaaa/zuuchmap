import postService from './postService';
import { API_CONFIG } from '../../config/api.config';
import { getFixedImageUrl, getPostTitle as getPostTitleUtil, getPostPrice as getPostPriceUtil } from '../../utils/postUtils';
import { logger } from '../../utils/logger';
import cacheManager from '../../utils/cacheManager';

const CACHED_POSTS_KEY = API_CONFIG.STORAGE_KEYS.CACHED_MAP_POSTS;
const CACHE_DURATION = API_CONFIG.CACHE.MAP_POSTS_DURATION;

const mapService = {
  getPostsWithLocation: async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = await cacheManager.getStorage(CACHED_POSTS_KEY);
      if (cached?.posts?.length) return cached.posts;
    }

    try {
      const response = await postService.getForMap();
      const posts = (Array.isArray(response.data) ? response.data : []).map(post => ({
        ...post,
        post_type: post.category,
        coordinates: {
          latitude: parseFloat(post.latitude),
          longitude: parseFloat(post.longitude),
        },
      }));

      await cacheManager.setStorage(CACHED_POSTS_KEY, { posts, timestamp: Date.now() }, CACHE_DURATION);
      return posts;
    } catch (error) {
      logger.error('Error loading posts with location:', error);
      const cached = await cacheManager.getStorage(CACHED_POSTS_KEY).catch(() => null);
      return cached?.posts || [];
    }
  },

  clearCache: async () => {
    await cacheManager.deleteStorage(CACHED_POSTS_KEY).catch(() => {});
  },

  filterByCategories: (posts, categories) => {
    if (!categories?.length) return posts;
    return posts.filter(p => categories.includes(p.post_type));
  },

  filterByPriceRange: (posts, priceRange) => {
    if (!priceRange) return posts;
    const min = priceRange.min ?? -Infinity;
    const max = priceRange.max ?? Infinity;
    if (min === -Infinity && max === Infinity) return posts;
    return posts.filter(p => {
      // A post with no price is not a free post. `|| 0` used to make every
      // unpriced listing (job vacancies, factories, material stores) match any
      // range starting at zero, so "under 50,000₮" was mostly priceless posts.
      if (p.price_amount === null || p.price_amount === undefined || p.price_amount === '') return false;
      const price = Number(p.price_amount);
      if (Number.isNaN(price)) return false;
      return price >= min && price <= max;
    });
  },

  filterByLocationRadius: (posts, center, radiusKm) => {
    if (!center || !radiusKm) return posts;
    return posts.filter(p =>
      mapService.calculateDistance(center.latitude, center.longitude, p.coordinates.latitude, p.coordinates.longitude) <= radiusKm
    );
  },

  calculateDistance: (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  getFixedImageUrl,

  getPostTitle: (post) => getPostTitleUtil(post, post.post_type || post.category),

  // Single implementation lives in postUtils (locale-aware units, coercion).
  getPostPrice: (post) => getPostPriceUtil(post),

  calculateBounds: (coordinates) => {
    if (!coordinates?.length) return null;
    let minLat = coordinates[0].latitude, maxLat = coordinates[0].latitude;
    let minLng = coordinates[0].longitude, maxLng = coordinates[0].longitude;
    coordinates.forEach(c => {
      minLat = Math.min(minLat, c.latitude); maxLat = Math.max(maxLat, c.latitude);
      minLng = Math.min(minLng, c.longitude); maxLng = Math.max(maxLng, c.longitude);
    });
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: (maxLat - minLat) * 1.1 || 0.05,
      longitudeDelta: (maxLng - minLng) * 1.1 || 0.05,
    };
  },

  groupPostsByLocation: (posts, clusterRadius = 0.01) => {
    const clusters = [];
    const processed = new Set();
    posts.forEach((post, i) => {
      if (processed.has(i)) return;
      const cluster = [post];
      processed.add(i);
      posts.forEach((other, j) => {
        if (processed.has(j) || i === j) return;
        const dist = Math.abs(post.coordinates.latitude - other.coordinates.latitude) +
          Math.abs(post.coordinates.longitude - other.coordinates.longitude);
        if (dist <= clusterRadius) { cluster.push(other); processed.add(j); }
      });
      clusters.push({
        posts: cluster,
        coordinate: cluster.length === 1 ? cluster[0].coordinates : {
          latitude: cluster.reduce((s, p) => s + p.coordinates.latitude, 0) / cluster.length,
          longitude: cluster.reduce((s, p) => s + p.coordinates.longitude, 0) / cluster.length,
        },
        count: cluster.length,
      });
    });
    return clusters;
  },

  saveMapPreferences: async (prefs) => {
    await cacheManager.setStorage(API_CONFIG.STORAGE_KEYS.MAP_PREFERENCES, prefs).catch(() => {});
  },

  loadMapPreferences: async () => {
    const prefs = await cacheManager.getStorage(API_CONFIG.STORAGE_KEYS.MAP_PREFERENCES).catch(() => null);
    // Defaults must match CustomerMapView's initial state (autoFitMarkers: false)
    // or the UI flips depending on whether the storage read has resolved.
    return prefs || { mapType: 'standard', showTraffic: false, clusterMarkers: true, autoFitMarkers: false };
  },
};

export default mapService;
