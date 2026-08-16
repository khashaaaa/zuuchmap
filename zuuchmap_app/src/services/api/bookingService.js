import apiClient from './apiClient';
import { API_CONFIG } from '../../config/api.config';

const E = API_CONFIG.ENDPOINTS;

const bookingService = {
  create: async ({ postId, startDate, endDate, message }) => {
    const res = await apiClient.post(E.BOOKINGS.CREATE, {
      post_id: postId,
      start_date: startDate,
      end_date: endDate,
      message: message || undefined,
    });
    return res.data;
  },

  mine: async () => (await apiClient.get(E.BOOKINGS.MINE)).data ?? [],
  received: async () => (await apiClient.get(E.BOOKINGS.RECEIVED)).data ?? [],

  accept: async (id, message) => (await apiClient.put(E.BOOKINGS.ACCEPT(id), { message })).data,
  decline: async (id, message) => (await apiClient.put(E.BOOKINGS.DECLINE(id), { message })).data,
  cancel: async (id) => (await apiClient.put(E.BOOKINGS.CANCEL(id), {})).data,

  // Reviews
  submitReview: async ({ providerId, rating, comment }) => {
    const res = await apiClient.post(E.REVIEWS.CREATE, {
      provider_id: providerId,
      rating,
      comment: comment || undefined,
    });
    return res.data;
  },

  providerReviews: async (providerId) => (await apiClient.get(E.REVIEWS.PROVIDER(providerId))).data,
};

export default bookingService;
