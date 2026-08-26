export const API_CONFIG = {
  // Dev builds hit the LAN engine for device testing; release builds compile
  // with __DEV__ === false and get production. API_BASE_URL overrides both.
  BASE_URL: process.env.API_BASE_URL || (__DEV__ ? 'http://192.168.1.32:8282/engine' : 'https://zuuchmap.com/engine'),

  ENDPOINTS: {
    AUTH: {
      VERIFY_START: '/auth/verify/start',
      VERIFY_STATUS: '/auth/verify/status',
    },

    USER: {
      PROFILE: '/user/profile',
      PROFILE_POSTS: '/user/profile/posts',
      SET_TYPE: '/user/type',
      UPDATE: (id) => `/user/${id}`,
      SAVE_PUSH_TOKEN: '/user/push-token',
      DELETE_ACCOUNT: '/user/account',
    },

    ADMIN: {
      PENDING_POSTS: '/admin/posts/pending',
      EDIT_POST: (id) => `/admin/posts/${id}`,
      APPROVE: (id) => `/admin/posts/${id}/approve`,
      REJECT: (id) => `/admin/posts/${id}/reject`,
      STATS: '/admin/stats',
    },

    COMPANY: {
      CREATE: '/company',
      GET: (id) => `/company/${id}`,
      UPDATE: (id) => `/company/${id}`,
    },

    ANALYTICS: {
      COLLECT: '/analytics/collect',
    },

    POSTS: {
      LIST: '/posts',
      MAP: '/posts/map',
      MINE: '/posts/mine',
      MINE_STATS: '/posts/mine/stats',
      CREATE: '/posts',
      GET: (id) => `/posts/${id}`,
      UPDATE: (id) => `/posts/${id}`,
      DELETE: (id) => `/posts/${id}`,
      INCREMENT_VIEWS: (id) => `/posts/${id}/views`,
      CATEGORIES: '/posts/categories/all',
    },

    BOOKINGS: {
      CREATE: '/bookings',
      MINE: '/bookings/mine',
      RECEIVED: '/bookings/received',
      ACCEPT: (id) => `/bookings/${id}/accept`,
      DECLINE: (id) => `/bookings/${id}/decline`,
      CANCEL: (id) => `/bookings/${id}/cancel`,
      BUSY: (postId) => `/bookings/post/${postId}/busy`,
    },

    REVIEWS: {
      CREATE: '/reviews',
      PROVIDER: (id) => `/reviews/provider/${id}`,
    },

    SAVED_SEARCHES: {
      LIST: '/saved-searches',
      CREATE: '/saved-searches',
      DELETE: (id) => `/saved-searches/${id}`,
    },

    LIKE: {
      LIKE: '/like',
      UNLIKE: (postType, postId) => `/like/${postType}/${postId}`,
      CHECK: (postType, postId) => `/like/check/${postType}/${postId}`,
      LIST: '/like',
      GET_IDS: '/like/ids',
      GET_STATS: (postType, postId) => `/like/stats/${postType}/${postId}`,
    },
  },

  STORAGE_KEYS: {
    AUTH_TOKEN: 'authToken',
    USER_ID: 'userId',
    USER_TYPE: 'userType',
    PHONE_NUMBER: 'phoneNumber',
    USER_INFO: 'userInfo',
    CACHED_MAP_POSTS: 'cached_map_posts',
    MAP_PREFERENCES: 'map_preferences',
    CATEGORY_SCHEMAS: 'category_schemas',
    DEVICE_ID: 'zm_device_id',
    // This device's Expo push token, so logout unbinds only this device.
    PUSH_TOKEN: 'zm_push_token',
    ANON_ID: 'zm_anon_id',
    // In-progress new post, restored if the app dies mid-form
    POST_DRAFT: 'zm_post_draft',
  },

  UPLOAD_PATHS: {
    PROFILE_PICTURE: 'profilepicture',
    COMPANY_LOGO: 'companylogo',
    POSTS: 'posts',
  },

  CACHE: {
    MAP_POSTS_DURATION: 15 * 60 * 1000,
    CATEGORY_SCHEMAS_DURATION: 60 * 60 * 1000,
  },
};

export const getUploadUrl = (path, filename) => {
  if (!filename) return null;
  if (filename.startsWith('http')) return filename;
  return `${API_CONFIG.BASE_URL}/uploads/${path}/${filename}`;
};

export const getPostImageUrl = (filename) => getUploadUrl('posts', filename);
