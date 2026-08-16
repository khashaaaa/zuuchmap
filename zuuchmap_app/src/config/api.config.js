export const API_CONFIG = {
  BASE_URL: process.env.API_BASE_URL || 'https://zuuchmap.com/engine',

  ENDPOINTS: {
    AUTH: {
      CHECK_USER: '/user/check',
      SEND_OTP: '/auth/otp/send',
      VERIFY_OTP: '/auth/otp/verify',
      ENROLL_BIOMETRIC: '/user/otp/enroll-biometric',
    },

    USER: {
      PROFILE: '/user/profile',
      PROFILE_POSTS: '/user/profile/posts',
      SET_TYPE: '/user/type',
      UPDATE: (id) => `/user/${id}`,
      SAVE_PUSH_TOKEN: '/user/push-token',
      DELETE_ACCOUNT: '/user/account',
    },

    PAGES: {
      PRIVACY: '/privacy/page',
      ACCOUNT_DELETION: '/account-deletion/page',
    },

    ADMIN: {
      PENDING_POSTS: '/admin/posts/pending',
      EDIT_POST: (id) => `/admin/posts/${id}`,
      APPROVE: (id) => `/admin/posts/${id}/approve`,
      REJECT: (id) => `/admin/posts/${id}/reject`,
      STATS: '/admin/stats',
    },

    COMPANY: {
      LIST: '/company',
      CREATE: '/company',
      GET: (id) => `/company/${id}`,
      UPDATE: (id) => `/company/${id}`,
      DELETE: (id) => `/company/${id}`,
    },

    POSTS: {
      LIST: '/posts',
      MAP: '/posts/map',
      MINE: '/posts/mine',
      CREATE: '/posts',
      GET: (id) => `/posts/${id}`,
      UPDATE: (id) => `/posts/${id}`,
      DELETE: (id) => `/posts/${id}`,
      INCREMENT_VIEWS: (id) => `/posts/${id}/views`,
      CATEGORIES: '/posts/categories/all',
      CATEGORY: (key) => `/posts/categories/${key}`,
    },

    BOOKINGS: {
      CREATE: '/bookings',
      MINE: '/bookings/mine',
      RECEIVED: '/bookings/received',
      ACCEPT: (id) => `/bookings/${id}/accept`,
      DECLINE: (id) => `/bookings/${id}/decline`,
      CANCEL: (id) => `/bookings/${id}/cancel`,
    },

    REVIEWS: {
      CREATE: '/reviews',
      PROVIDER: (id) => `/reviews/provider/${id}`,
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
  },

  UPLOAD_PATHS: {
    PROFILE_PICTURE: 'profilepicture',
    COMPANY_LOGO: 'companylogo',
    POSTS: 'posts',
  },

  CACHE: {
    MAP_POSTS_DURATION: 15 * 60 * 1000,
    POST_LIST_DURATION: 10 * 60 * 1000,
    CATEGORY_SCHEMAS_DURATION: 60 * 60 * 1000,
  },
};

export const getUploadUrl = (path, filename) => {
  if (!filename) return null;
  if (filename.startsWith('http')) return filename;
  return `${API_CONFIG.BASE_URL}/uploads/${path}/${filename}`;
};

export const getPostImageUrl = (filename) => getUploadUrl('posts', filename);
