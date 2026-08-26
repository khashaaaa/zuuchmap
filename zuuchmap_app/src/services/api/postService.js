import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { API_CONFIG, getPostImageUrl } from '../../config/api.config';
import { getUserId, getAuthToken } from './authHelpers';
import apiClient from './apiClient';
import { logger } from '../../utils/logger';
import cacheManager from '../../utils/cacheManager';

// Offline fallback for the first browse page: the last good result for a given
// query string, kept a day. Only read when the request never reached the server.
const BROWSE_CACHE_PREFIX = 'cached_browse_';
const BROWSE_CACHE_DURATION = 24 * 60 * 60 * 1000;

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

/**
 * `isEdit` decides whether `existingImages` is sent at all.
 *
 * On update it must ALWAYS be sent, including as `[]`. The engine reads
 * `dto.existingImages || post.images || []`, so an omitted key means "keep
 * every photo currently on the post" — which made deleting the last photo a
 * no-op, and turned "replace all my photos" into "append to the old ones".
 *
 * On create it must NEVER be sent: `CreatePostDto` has no such property and the
 * global ValidationPipe runs `forbidNonWhitelisted`, so an extra key is a 400.
 */
const buildFormData = async (postData, { isEdit = false } = {}) => {
  const formData = new FormData();
  const { images, ...rawData } = postData;

  const userId = await getUserId();
  if (!userId) {
    const error = new Error('User ID missing from storage');
    error.code = 'USER_ID_MISSING';
    throw error;
  }
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

  const allImages = Array.isArray(images) ? images.filter(Boolean) : [];
  const existingImages = allImages.filter(img => img.startsWith('http'));
  const newImages = allImages.filter(img => !img.startsWith('http'));

  // Unconditional on edit — `[]` is the instruction to drop every photo, and
  // omitting the key is the instruction to keep them all.
  if (isEdit) {
    const filenames = existingImages.map(url => url.split('/').pop());
    formData.append('existingImages', JSON.stringify(filenames));
  }

  for (let i = 0; i < newImages.length; i++) {
    try {
      const uri = await compressImage(newImages[i]);
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpeg';
      const type = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpeg';
      formData.append('images', { uri, name: `${i}.${type}`, type: `image/${type}` });
    } catch (err) {
      logger.error('Error processing image:', err);
    }
  }

  return formData;
};

/** Ceiling for a whole multipart upload, images included. */
const UPLOAD_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Multipart upload with progress.
 *
 * XMLHttpRequest rather than fetch: React Native's fetch reports no upload
 * progress at all, so a post carrying five photos sat behind a button that said
 * "creating" and nothing else for the length of the upload. RN implements fetch
 * on top of XHR anyway, so this is the same transport with the one event fetch
 * hides. `onProgress` receives 0-100; it is optional and everything else about
 * the contract — auth header, JSON body, the `error.response = { status, data }`
 * shape callers unwrap, the `{ data }` return — is unchanged.
 */
const uploadWithProgress = async (method, endpoint, formData, onProgress) => {
  const token = await getAuthToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_CONFIG.BASE_URL}${endpoint}`);
    // `ontimeout` below can only fire if this is set — XHR defaults to 0, which
    // means "wait forever", so a stalled upload sat behind "uploading N%" with
    // no way out. Generous: five compressed photos on a weak mobile connection
    // is genuinely slow, and a false timeout costs the provider the whole form.
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Content-Type is deliberately unset: the runtime adds it with the
    // multipart boundary, and setting it by hand drops the boundary.

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        // `total` is 0 until the body length is known — report nothing rather
        // than a fake number, and the caller keeps its indeterminate spinner.
        if (!e.lengthComputable || !e.total) return;
        onProgress(Math.min(100, Math.round((e.loaded * 100) / e.total)));
      };
    }

    const fail = (message, status = 0, data = {}) => {
      const error = new Error(message);
      error.response = { status, data };
      reject(error);
    };

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { data = {}; }
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ data });
      fail(data?.message || `HTTP ${xhr.status}`, xhr.status, data);
    };
    // A dropped connection has no HTTP status; errorManager already maps a
    // status-less failure to the offline message.
    xhr.onerror = () => fail('Network request failed');
    xhr.ontimeout = () => fail('Network request timed out');
    xhr.onabort = () => fail('Upload cancelled');

    xhr.send(formData);
  });
};

const normalizeImages = (post) => {
  if (post?.images?.length) {
    post.images = post.images.map(img => getPostImageUrl(img));
  }
  return post;
};

const postService = {
  getApiUrl: () => API_CONFIG.BASE_URL,

  create: async (category, postData, onProgress) => {
    const formData = await buildFormData({ ...postData, category });
    return uploadWithProgress('POST', API_CONFIG.ENDPOINTS.POSTS.CREATE, formData, onProgress);
  },

  update: async (postId, postData, onProgress) => {
    const formData = await buildFormData(postData, { isEdit: true });
    return uploadWithProgress('PATCH', API_CONFIG.ENDPOINTS.POSTS.UPDATE(postId), formData, onProgress);
  },

  getList: async ({
    category, subcategory, province, district, approval_status, status,
    page, limit, q, sort, price_min, price_max,
  } = {}) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (subcategory) params.append('subcategory', subcategory);
    if (province) params.append('province', province);
    if (district) params.append('district', district);
    if (approval_status) params.append('approval_status', approval_status);
    if (status) params.append('status', status);
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (q) params.append('q', q);
    if (sort) params.append('sort', sort);
    if (price_min) params.append('price_min', price_min);
    if (price_max) params.append('price_max', price_max);
    const qs = params.toString();
    const isFirstPage = !page || Number(page) === 1;
    const cacheKey = `${BROWSE_CACHE_PREFIX}${qs}`;
    let response;
    try {
      response = await apiClient.get(`${API_CONFIG.ENDPOINTS.POSTS.LIST}${qs ? `?${qs}` : ''}`);
    } catch (error) {
      // No HTTP response at all ⇒ offline. Serve the saved first page, flagged.
      if (!error?.response && isFirstPage) {
        const cached = await cacheManager.getStorage(cacheKey);
        if (cached?.items) {
          return { data: cached.items, total: cached.total, fromCache: true, cachedAt: cached.timestamp ?? null };
        }
      }
      throw error;
    }
    // Server returns { items, total }; keep response.data as the array for existing consumers
    const body = response.data;
    const items = Array.isArray(body) ? body : (body?.items ?? []);
    response.data = items.map(normalizeImages);
    response.total = Array.isArray(body) ? items.length : (body?.total ?? items.length);
    response.fromCache = false;
    if (isFirstPage) {
      cacheManager.setStorage(cacheKey, { items: response.data, total: response.total, timestamp: Date.now() }, BROWSE_CACHE_DURATION);
    }
    return response;
  },

  // Same-category neighbours, nearest in price and place. Public.
  getSimilar: async (postId, limit = 6) => {
    const response = await apiClient.get(`${API_CONFIG.ENDPOINTS.POSTS.GET(postId)}/similar?limit=${limit}`);
    const items = Array.isArray(response.data) ? response.data : [];
    return items.map(normalizeImages);
  },

  getForMap: async () => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.POSTS.MAP);
    if (Array.isArray(response.data)) response.data = response.data.map(normalizeImages);
    return response;
  },

  getMine: async ({ page, limit } = {}) => {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    const qs = params.toString();
    const response = await apiClient.get(`${API_CONFIG.ENDPOINTS.POSTS.MINE}${qs ? `?${qs}` : ''}`);
    if (Array.isArray(response.data)) response.data = response.data.map(normalizeImages);
    return response;
  },

  // Attention stats (views / saves / booking requests) for the provider's posts.
  getMyStats: async () => (await apiClient.get(API_CONFIG.ENDPOINTS.POSTS.MINE_STATS)).data,

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
