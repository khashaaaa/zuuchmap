import { Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { API_CONFIG, getPostImageUrl } from '../../config/api.config';
import { getUserId, getAuthToken } from './authHelpers';
import apiClient from './apiClient';
import { logger } from '../../utils/logger';

const compressImage = async (imageUri) => {
  try {
    const result = await manipulateAsync(
      imageUri,
      [{ resize: { width: 1024 } }],
      { compress: 0.6, format: SaveFormat.JPEG }
    );
    return result.uri;
  } catch (error) {
    logger.error('Image compression failed:', error);
    throw error;
  }
};

const buildFormData = async (postData) => {
  const formData = new FormData();
  const { images, ...rawData } = postData;

  const userId = await getUserId();
  if (!userId) throw new Error('Хэрэглэгчийн ID хадгалалтад олдсонгүй');
  formData.append('user', userId);

  for (const [key, val] of Object.entries(rawData)) {
    if (val === null || val === undefined) continue;
    if (val instanceof Date) {
      formData.append(key, val.toISOString());
    } else if (typeof val === 'object') {
      formData.append(key, JSON.stringify(val));
    } else {
      formData.append(key, String(val));
    }
  }

  if (images?.length) {
    const existingImages = images.filter(img => img?.startsWith('http'));
    const newImages = images.filter(img => img && !img.startsWith('http'));

    if (existingImages.length) {
      const filenames = existingImages.map(url => url.split('/').pop());
      formData.append('existingImages', JSON.stringify(filenames));
    }

    for (let i = 0; i < newImages.length; i++) {
      try {
        const uri = await compressImage(newImages[i]);
        const ext = uri.split('.').pop()?.toLowerCase() || 'jpeg';
        const type = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpeg';
        if (Platform.OS === 'web') {
          // RN-style {uri,name,type} file objects serialize to "[object Object]"
          // in browser FormData — convert the uri to a real File instead.
          const blob = await (await fetch(uri)).blob();
          formData.append('images', new File([blob], `${i}.${type}`, { type: `image/${type}` }));
        } else {
          formData.append('images', { uri, name: `${i}.${type}`, type: `image/${type}` });
        }
      } catch (err) {
        logger.error('Error processing image:', err);
      }
    }
  }

  return formData;
};

const uploadWithFetch = async (method, endpoint, formData) => {
  const token = await getAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
    method,
    headers,
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `HTTP ${response.status}`);
    error.response = { status: response.status, data };
    throw error;
  }
  return { data };
};

const normalizeImages = (post) => {
  if (post?.images?.length) {
    post.images = post.images.map(img => getPostImageUrl(img));
  }
  return post;
};

const postService = {
  getApiUrl: () => API_CONFIG.BASE_URL,

  create: async (category, postData) => {
    const formData = await buildFormData({ ...postData, category });
    return uploadWithFetch('POST', API_CONFIG.ENDPOINTS.POSTS.CREATE, formData);
  },

  update: async (postId, postData) => {
    const formData = await buildFormData(postData);
    return uploadWithFetch('PATCH', API_CONFIG.ENDPOINTS.POSTS.UPDATE(postId), formData);
  },

  getList: async ({ category, approval_status, status, page, limit, q } = {}) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (approval_status) params.append('approval_status', approval_status);
    if (status) params.append('status', status);
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (q) params.append('q', q);
    const qs = params.toString();
    const response = await apiClient.get(`${API_CONFIG.ENDPOINTS.POSTS.LIST}${qs ? `?${qs}` : ''}`);
    // Server returns { items, total }; keep response.data as the array for existing consumers
    const body = response.data;
    const items = Array.isArray(body) ? body : (body?.items ?? []);
    response.data = items.map(normalizeImages);
    response.total = Array.isArray(body) ? items.length : (body?.total ?? items.length);
    return response;
  },

  getForMap: async () => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.POSTS.MAP);
    if (Array.isArray(response.data)) response.data = response.data.map(normalizeImages);
    return response;
  },

  getMine: async () => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.POSTS.MINE);
    if (Array.isArray(response.data)) response.data = response.data.map(normalizeImages);
    return response;
  },

  getById: async (postId, incrementView = false) => {
    const qs = incrementView ? '?increment_view=true' : '';
    const response = await apiClient.get(`${API_CONFIG.ENDPOINTS.POSTS.GET(postId)}${qs}`);
    normalizeImages(response.data);
    return response;
  },

  incrementViews: async (postId) => {
    return apiClient.put(API_CONFIG.ENDPOINTS.POSTS.INCREMENT_VIEWS(postId), {}).catch(() => null);
  },

  deletePost: async (postId) => {
    return apiClient.delete(API_CONFIG.ENDPOINTS.POSTS.DELETE(postId));
  },

  // Admin methods
  getPendingPosts: async (category = null) => {
    const params = category ? { category } : {};
    return apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.PENDING_POSTS, { params });
  },
  adminEditPost: async (postId, updates) => apiClient.patch(API_CONFIG.ENDPOINTS.ADMIN.EDIT_POST(postId), updates),
  approvePost: async (postId) => apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.APPROVE(postId)),
  rejectPost: async (postId, reason) => apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.REJECT(postId), { reason }),
  getAdminStats: async () => apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.STATS),
};

export default postService;
