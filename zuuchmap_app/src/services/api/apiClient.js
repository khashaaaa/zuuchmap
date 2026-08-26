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
        // Lets the engine dedupe anonymous views without keying on an IP that a
        // whole carrier may share. Already generated for analytics; reusing it
        // avoids minting a second per-install identifier for the same purpose.
        try {
            const { getAnonId } = await import('../../utils/device');
            config.headers['X-Visitor-Id'] = await getAnonId();
        } catch {
            // Storage unavailable — the view simply does not dedupe. Never a
            // reason to fail the request it was riding along on.
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
        if (error.response?.status === 401) {
            if (error.config?.headers?.Authorization) {
                const { clearAuthData } = await import('./authHelpers');
                await clearAuthData();
                const { resetToLogin } = await import('../../utils/navigationUtils');
                resetToLogin();
            } else {
                // Tokenless: a query that was still observed when logout pulled
                // the session out from under it. Nothing is wrong and there is
                // nobody to tell — tag it so the screens and services that
                // report their own failures can stay quiet too.
                error.isPostLogoutStraggler = true;
            }
        }
        return Promise.reject(error);
    }
);

export default apiClient;
