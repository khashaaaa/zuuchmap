import axios from 'axios'
import { toast } from 'sonner'
import { getToken } from './auth'
import { getVisitorId } from './visitor'
import { useAuthStore } from '../store'
import i18n from '../i18n'

const BASE = import.meta.env.VITE_API_URL ?? 'https://zuuchmap.com/engine'

/** multipart config, plus a 0-100 progress callback when the caller wants one. */
const uploadCfg = (onProgress) => ({
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: onProgress
    ? (e) => {
        // `total` is absent when the body length is unknown — report nothing
        // rather than a fake number, and the caller keeps its spinner.
        if (!e.total) return
        onProgress(Math.min(100, Math.round((e.loaded * 100) / e.total)))
      }
    : undefined,
})

export const client = axios.create({ baseURL: BASE })

client.interceptors.request.use((cfg) => {
  const token = getToken()
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  // Lets the server dedupe anonymous views without keying on an IP address that
  // a whole carrier may share. Harmless on authenticated requests, which key on
  // the account instead.
  cfg.headers['X-Visitor-Id'] = getVisitorId()
  return cfg
})

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const hadToken = Boolean(useAuthStore.getState().token)
      if (hadToken) toast.error(i18n.t('common.sessionExpired'))
      useAuthStore.getState().logout()
    }
    return Promise.reject(err)
  }
)

const data = (r) => r.data?.data ?? r.data

// Auth — verify.mn Mobile-Originated flow: the user texts a code to the
// shortcode, we poll until the provider confirms it arrived from their number.
export const authApi = {
  start: (phone, deviceId) =>
    client.post('/auth/verify/start', { phone_number: phone, device_id: deviceId }).then(data),
  status: (sessionId) =>
    client.post('/auth/verify/status', { session_id: sessionId }).then(data),
}

// Analytics — fire-and-forget; never let a failed beacon surface to the user.
export const analyticsApi = {
  collect: (payload) =>
    client.post('/analytics/collect', payload).catch(() => {}),
  summary: (days) => client.get('/analytics/summary', { params: { days } }).then(data),
}

// Posts
export const postsApi = {
  getAll: (params) => client.get('/posts', { params }).then(data),
  getMap: () => client.get('/posts/map').then(data),
  getStats: () => client.get('/posts/stats').then(data),
  getOne: (id) => client.get(`/posts/${id}`).then(data),
  getMine: () => client.get('/posts/mine').then(data),
  getMyStats: () => client.get('/posts/mine/stats').then(data),
  // `onProgress` receives 0-100. A post carries up to five photos, so on a slow
  // mobile connection this is a minute of upload behind a button that otherwise
  // says nothing but "creating".
  create: (form, onProgress) => client.post('/posts', form, uploadCfg(onProgress)).then(data),
  update: (id, form, onProgress) => client.patch(`/posts/${id}`, form, uploadCfg(onProgress)).then(data),
  remove: (id) => client.delete(`/posts/${id}`),
  view: (id) => client.put(`/posts/${id}/views`),
  // Same shape as /posts items: same category, nearest location and price first.
  similar: (id, limit = 6) => client.get(`/posts/${id}/similar`, { params: { limit } }).then(data),
}

// Saved searches — the filter set of a browse page, kept server-side so the
// engine can push when a matching post is approved. Max 10 per user.
export const savedSearchApi = {
  list: () => client.get('/saved-searches').then(data),
  create: (body) => client.post('/saved-searches', body).then(data),
  remove: (id) => client.delete(`/saved-searches/${id}`),
}

// Admin
export const adminApi = {
  getStats: () => client.get('/admin/stats').then(data),
  getPending: (params) => client.get('/admin/posts/pending', { params }).then(data),
  editPost: (id, body) => client.patch(`/admin/posts/${id}`, body),
  approve: (id) => client.put(`/admin/posts/${id}/approve`),
  // One request for the whole selection — see AdminService.approvePosts.
  approveMany: (ids) => client.put('/admin/posts/approve', { ids }).then(data),
  reject: (id, reason, field_key) => client.put(`/admin/posts/${id}/reject`, { reason, ...(field_key ? { field_key } : {}) }),
  broadcast: (body) => client.post('/admin/broadcast', body).then(data),
  // Paid placement. `days: 0` clears the window; the server clamps to 90.
  feature: (id, days) => client.put(`/admin/posts/${id}/feature`, { days }).then(data),
  // Granted only after a human checks the registration number — never as a
  // side effect of payment. See AdminService.setCompanyVerified.
  verifyCompany: (id, is_verified) => client.put(`/admin/companies/${id}/verify`, { is_verified }).then(data),
}

// Users
export const usersApi = {
  getAll: () => client.get('/user').then(data),
  getProfile: () => client.get('/user/profile').then(data),
  getById: (id) => client.get(`/user/${id}`).then(data),
  update: (id, form) => client.patch(`/user/${id}`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(data),
  deleteAccount: () => client.delete('/user/account'),
  deleteUser: (id) => client.delete(`/user/${id}`),
  setType: (type, phone_number) => client.post('/user/type', { type, phone_number }).then(data),
  setPlan: (id, plan, months = 1) => client.put(`/admin/users/${id}/plan`, { plan, months }).then(data),
}

// Likes
export const likesApi = {
  getLiked: () => client.get('/like').then(r => r.data?.posts ?? []),
  // Without ?post_type= the engine answers { liked_by_type: { [type]: ids[] } };
  // post ids are unique across types, so flatten to one set for the grid.
  getIds: () => client.get('/like/ids').then(r => Object.values(r.data?.liked_by_type ?? {}).flat()),
  toggle: (post_id, post_type) => client.post('/like', { post_id, post_type }),
  unlike: (post_type, post_id) => client.delete(`/like/${post_type}/${post_id}`),
  check: (post_type, post_id) => client.get(`/like/check/${post_type}/${post_id}`).then(data),
}

// Company
export const companyApi = {
  getById: (id) => client.get(`/company/${id}`).then(data),
  create: (form) => client.post('/company', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(data),
  update: (id, form) => client.patch(`/company/${id}`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(data),
}

// Categories
export const categoryApi = {
  getAll: () => client.get('/posts/categories/all').then(data),
  getAllForAdmin: () => client.get('/posts/categories/admin').then(data),
  create: (body) => client.post('/posts/categories', body).then(data),
  update: (key, body) => client.patch(`/posts/categories/${key}`, body).then(data),
}

// Bookings
export const bookingsApi = {
  create: (body) => client.post('/bookings', body).then(data),
  mine: () => client.get('/bookings/mine').then(data),
  received: () => client.get('/bookings/received').then(data),
  accept: (id, message) => client.put(`/bookings/${id}/accept`, { message }).then(data),
  decline: (id, message) => client.put(`/bookings/${id}/decline`, { message }).then(data),
  cancel: (id) => client.put(`/bookings/${id}/cancel`).then(data),
  busy: (postId) => client.get(`/bookings/post/${postId}/busy`).then(data),
}

// Reviews
export const reviewsApi = {
  upsert: (body) => client.post('/reviews', body).then(data),
  forProvider: (providerId) => client.get(`/reviews/provider/${providerId}`).then(data),
}

// Payments — QPay invoices for a provider plan. `catalogue` is public so the
// upgrade screen can price itself before anyone signs in.
export const paymentsApi = {
  catalogue: () => client.get('/payments/catalogue').then(data),
  createInvoice: (plan, months = 1) =>
    client.post('/payments/invoice', { plan, months }).then(data),
  // Polled while the QR is on screen; scoped server-side to the caller's own
  // invoices, so an id on its own reveals nothing.
  check: (id) => client.get(`/payments/${id}/check`).then(data),
  mine: () => client.get('/payments/mine').then(data),
}

// Messaging — one thread per (listing, customer).
export const messagesApi = {
  // `before` is a cursor on the thread's last activity; 50 per page.
  list: (cursor) =>
    client.get('/conversations', {
      params: cursor ? { before: cursor.before, before_id: cursor.before_id } : {},
    }).then(data),
  unreadCount: () => client.get('/conversations/unread-count').then(data),
  open: (post_id, body) => client.post('/conversations', { post_id, ...(body ? { body } : {}) }).then(data),
  detail: (id) => client.get(`/conversations/${id}`).then(data),
  // `before` + `before_id` form a cursor on (date_created, id) — an offset
  // would drift under the thread every time the other side sends something.
  history: (id, cursor) =>
    client
      .get(`/conversations/${id}/messages`, {
        params: cursor ? { before: cursor.before, before_id: cursor.before_id } : {},
      })
      .then(data),
  send: (id, body) => client.post(`/conversations/${id}/messages`, { body }).then(data),
  markRead: (id) => client.put(`/conversations/${id}/read`).then(data),
}

// Reports — user-filed moderation flags on listings that are already live.
// The closed reason list, mirrored from the engine's `REPORT_REASONS` so the
// sheet can paint before `reasons()` answers; check:sync holds the two equal.
export const REPORT_REASONS = ['SPAM', 'SCAM', 'WRONG_INFO', 'UNAVAILABLE', 'OFFENSIVE', 'OTHER']
export const reportsApi = {
  reasons: () => client.get('/reports/reasons').then(data),
  create: (post_id, reason, detail) => client.post('/reports', { post_id, reason, ...(detail ? { detail } : {}) }).then(data),
  list: (params) => client.get('/reports', { params }).then(data),
  count: () => client.get('/reports/count').then(data),
  resolve: (id, status, resolution) => client.put(`/reports/${id}`, { status, ...(resolution ? { resolution } : {}) }).then(data),
}

// Web push — a browser subscription, stored beside the app's Expo devices.
export const webPushApi = {
  vapidKey: () => client.get('/user/push/vapid-key').then(data),
  subscribe: (endpoint, keys) => client.put('/user/push/web', { endpoint, keys }).then(data),
  unsubscribe: (endpoint) => client.delete('/user/push/web', { data: { endpoint } }).then(data),
}
