import axios from 'axios';
import { API_CONFIG } from '../../config/api.config';

export const apiClient = axios.create({
    baseURL: API_CONFIG.BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    }
});

apiClient.interceptors.request.use(
    async (config) => {
        const { getAuthToken } = await import('./authHelpers');
        const token = await getAuthToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
        }
        return config;
    },
    (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            const { clearAuthData } = await import('./authHelpers');
            await clearAuthData();
        }
        return Promise.reject(error);
    }
);

export default apiClient;
