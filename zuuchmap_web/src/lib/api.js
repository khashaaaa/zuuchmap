import axios from 'axios'
import { toast } from 'sonner'
import { getToken } from './auth'
import { useAuthStore } from '../store'
import i18n from '../i18n'

const BASE = import.meta.env.VITE_API_URL ?? 'https://zuuchmap.com/engine'

export const client = axios.create({ baseURL: BASE })

client.interceptors.request.use((cfg) => {
  const token = getToken()
  if (token) cfg.headers.Authorization = `Bearer ${token}`
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
  create: (form) => client.post('/posts', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(data),
  update: (id, form) => client.patch(`/posts/${id}`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(data),
  remove: (id) => client.delete(`/posts/${id}`),
  view: (id) => client.put(`/posts/${id}/views`),
}

// Admin
export const adminApi = {
  getStats: () => client.get('/admin/stats').then(data),
  getPending: () => client.get('/admin/posts/pending').then(data),
  editPost: (id, body) => client.patch(`/admin/posts/${id}`, body),
  approve: (id) => client.put(`/admin/posts/${id}/approve`),
  reject: (id, reason) => client.put(`/admin/posts/${id}/reject`, { reason }),
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
}

// Likes
export const likesApi = {
  getLiked: () => client.get('/like').then(r => r.data?.posts ?? []),
  getIds: () => client.get('/like/ids').then(r => r.data?.liked_post_ids ?? []),
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
}

// Reviews
export const reviewsApi = {
  upsert: (body) => client.post('/reviews', body).then(data),
  forProvider: (providerId) => client.get(`/reviews/provider/${providerId}`).then(data),
  remove: (id) => client.delete(`/reviews/${id}`),
}
