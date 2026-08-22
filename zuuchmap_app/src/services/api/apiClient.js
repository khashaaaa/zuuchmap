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
        // A 401 on a request that carried a token means the session itself is
        // dead (expired or rotated JWT) — the mounted screens can't recover, so
        // wipe the session and land on the login screen. Tokenless 401s (refetch
        // stragglers while a logout is already in flight) are left alone.
        if (error.response?.status === 401 && error.config?.headers?.Authorization) {
            const { clearAuthData } = await import('./authHelpers');
            await clearAuthData();
            const { resetToLogin } = await import('../../utils/navigationUtils');
            resetToLogin();
        }
        return Promise.reject(error);
    }
);

export default apiClient;
