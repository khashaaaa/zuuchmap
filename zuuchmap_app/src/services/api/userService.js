import axios from 'axios';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, getUploadUrl } from '../../config/api.config';
import { DEFAULT_AVATAR_URL } from '../../config/app.config';
import { getAuthToken, getUserId, getUserType, storeAuthData, emitAuthChanged } from './authHelpers';
import { socketService } from '../socketService';
import { queryClient } from '../queryClient';
import apiClient from './apiClient';
import { navigateToDashboard } from '../../utils/navigationUtils';
import { logger } from '../../utils/logger';
import { isPostLogoutStraggler } from '../../utils/errorManager';
import { getDeviceId } from '../../utils/device';
import { clearAllDrafts } from '../../utils/draftStorage';

const API_URL = API_CONFIG.BASE_URL;

const handleRoleNavigation = async (selectedRole, navigation) => {
    await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_TYPE, selectedRole);

    if (navigation) {
        navigateToDashboard(navigation, selectedRole);
    }
};

const userService = {
    getUserType: getUserType,

    /**
     * Begins phone verification. Resolves with `verified: true` and a stored
     * token when this device was already trusted — no SMS, no charge to the
     * user. Otherwise returns the code they must text to the shortcode.
     */
    startVerification: async (phoneNumber) => {
        const deviceId = await getDeviceId();
        const response = await axios.post(`${API_URL}${API_CONFIG.ENDPOINTS.AUTH.VERIFY_START}`, {
            phone_number: phoneNumber,
            device_id: deviceId,
        });

        const data = response.data?.data ?? {};
        if (data.verified && data.auth?.token) {
            await storeAuthData({ ...data.auth.user, token: data.auth.token }, phoneNumber);
        }
        return data;
    },

    /** Polls until verify.mn confirms the SMS arrived from the claimed number. */
    checkVerification: async (sessionId, phoneNumber) => {
        const response = await axios.post(`${API_URL}${API_CONFIG.ENDPOINTS.AUTH.VERIFY_STATUS}`, {
            session_id: sessionId,
        });

        const data = response.data?.data ?? {};
        if (data.status === 'VERIFIED' && data.auth?.token) {
            await storeAuthData({ ...data.auth.user, token: data.auth.token }, phoneNumber);
        }
        return data;
    },

    setUserType: async (phoneNumber, type, _token = null, navigation = null) => {
        try {
            const response = await apiClient.post(API_CONFIG.ENDPOINTS.USER.SET_TYPE, {
                phone_number: phoneNumber,
                type
            });
            await handleRoleNavigation(type, navigation);
            return response;
        } catch (error) {
            throw error;
        }
    },

    isAuthenticated: async () => {
        try {
            const token = await getAuthToken();
            const userType = await getUserType();

            if (!token) {
                return { authenticated: false, roleSelected: false };
            }

            try {
                const response = await apiClient.get(API_CONFIG.ENDPOINTS.USER.PROFILE);

                if (response.data && response.data.type) {
                    if (userType !== response.data.type) {
                        await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_TYPE, response.data.type);
                    }
                    return { authenticated: true, roleSelected: true, userType: response.data.type, is_admin: response.data.is_admin === true };
                }

                return { authenticated: true, roleSelected: !!userType, userType };
            } catch (error) {
                if (error.response?.status === 401) {
                    return { authenticated: false, roleSelected: false };
                }
                if (error.response?.status === 429) {
                    // Rate limited. A 429 says nothing about whether the token is
                    // valid, but it is reported as unauthenticated, so the user is
                    // sent to the login screen with a working session. `rateLimited`
                    // exists for a caller that wants to retry instead — nothing reads
                    // it yet.
                    logger.error('Error during profile check:', error);
                    return { authenticated: false, roleSelected: false, rateLimited: true };
                }
                logger.error('Error during profile check:', error);
                throw error;
            }
        } catch (error) {
            logger.error('Authentication check failed:', error.message);
            if (error.response) {
                logger.error('Auth check response status:', error.response.status);
                logger.error('Auth check response data:', error.response.data);
            }
            return { authenticated: false, roleSelected: false };
        }
    },

    deleteAccount: async () => {
        const response = await apiClient.delete(API_CONFIG.ENDPOINTS.USER.DELETE_ACCOUNT);
        return response.data;
    },

    logout: async (keepUserInfo = true) => {
        try {
            // Read what the server call needs, then stop being logged in. The
            // network round-trip used to come first and be awaited, so on a slow
            // connection the token sat in storage for up to the 30s timeout after
            // the UI had already returned to the login screen — kill the app in
            // that window and the next launch found a live session and went
            // straight back to the dashboard.
            const [token, pushToken] = await Promise.all([
                AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN),
                AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.PUSH_TOKEN),
            ]);
            socketService.disconnect();
            if (keepUserInfo) {
                await AsyncStorage.multiRemove([
                    API_CONFIG.STORAGE_KEYS.AUTH_TOKEN,
                    API_CONFIG.STORAGE_KEYS.USER_ID
                ]);
            } else {
                await AsyncStorage.multiRemove([
                    API_CONFIG.STORAGE_KEYS.AUTH_TOKEN,
                    API_CONFIG.STORAGE_KEYS.USER_ID,
                    API_CONFIG.STORAGE_KEYS.USER_TYPE,
                    API_CONFIG.STORAGE_KEYS.PHONE_NUMBER,
                    API_CONFIG.STORAGE_KEYS.USER_INFO,
                ]);
            }
            AsyncStorage.removeItem(API_CONFIG.STORAGE_KEYS.PUSH_TOKEN).catch(() => {});
            // Post drafts are keyed by category, not by user, so nothing else
            // drops them — they would be offered to whoever signs in next.
            clearAllDrafts().catch(() => {});
            emitAuthChanged();

            // Now that the session is gone locally, tell the server to stop
            // pushing to *this* device. Carries its own credentials because the
            // interceptor has nothing left to attach, and is deliberately not
            // awaited: logout is already complete and a dead network must not
            // hold it open. Scoped to this device's token so other devices the
            // account is still signed in on keep receiving notifications.
            if (token) {
                apiClient.delete(API_CONFIG.ENDPOINTS.USER.SAVE_PUSH_TOKEN, {
                    headers: { Authorization: `Bearer ${token}` },
                    data: pushToken ? { push_token: pushToken } : undefined,
                    timeout: 5000,
                }).catch((err) => logger.warn?.('Push token clear failed on logout:', err?.message));
            }
            // Callers reset to the auth stack before calling logout, but the
            // exit animation keeps the old screen mounted for a beat — clearing
            // the cache while its queries are still observed refetches them
            // tokenless (a 401 burst). Wait out the transition first.
            await new Promise((resolve) => InteractionManager.runAfterInteractions(resolve));
            queryClient.clear();
            return true;
        } catch (error) {
            logger.error('Logout error:', error);
            return false;
        }
    },

    getUserPosts: async () => {
        return apiClient.get(API_CONFIG.ENDPOINTS.USER.PROFILE_POSTS);
    },

    getUserProfile: async () => {
        try {
            const response = await apiClient.get(API_CONFIG.ENDPOINTS.USER.PROFILE);

            return {
                id: response.data.id,
                name: response.data.parent_name && response.data.given_name
                    ? `${response.data.parent_name} ${response.data.given_name}`
                    : response.data.given_name || response.data.parent_name || '',
                given_name: response.data.given_name || '',
                parent_name: response.data.parent_name || '',
                phoneNumber: response.data.phone_number,
                email: response.data.email,
                profilePicture: response.data.profile_picture
                    ? getUploadUrl(API_CONFIG.UPLOAD_PATHS.PROFILE_PICTURE, response.data.profile_picture)
                    : DEFAULT_AVATAR_URL,
                userType: response.data.type,
                is_admin: response.data.is_admin === true,
                companyId: response.data.company ? response.data.company.id : null,
                companyName: response.data.company ? response.data.company.name : null,
                companyLogo: response.data.company && response.data.company.logo
                    ? getUploadUrl(API_CONFIG.UPLOAD_PATHS.COMPANY_LOGO, response.data.company.logo)
                    : null,
                companyDescription: response.data.company ? response.data.company.description : null,
                companyWebsite: response.data.company ? response.data.company.website : null,
                companyAddress: response.data.company ? response.data.company.address : null,
                companyPhoneNumber: response.data.company ? response.data.company.phone_number : null,
                companyEmail: response.data.company ? response.data.company.email : null,
                companyRegistrationNumber: response.data.company ? response.data.company.registration_number : null,
                companyTaxId: response.data.company ? response.data.company.tax_id : null,
                companyIsVerified: response.data.company ? response.data.company.is_verified : null,
                address: response.data.address,

                totalPosts: response.data.totalPosts || 0,
                activePosts: response.data.activePosts || 0,

                memberSince: (() => {
                    const date = new Date(response.data.date_created);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    return `${year}-${month}`;
                })()
            };
        } catch (error) {
            // A logout straggler is expected, not a fault: stay quiet and let
            // the caller decide. Everything else is still reported.
            if (!isPostLogoutStraggler(error)) logger.error('Error in getUserProfile:', error);
            throw error;
        }
    },

    updateProfile: async (userData, profilePicture = null) => {
        try {
            const formData = new FormData();

            Object.keys(userData).forEach(key => {
                if (userData[key] !== null && userData[key] !== undefined) {
                    formData.append(key, userData[key]);
                }
            });

            if (profilePicture) {
                const uriParts = profilePicture.split('.');
                const fileType = uriParts[uriParts.length - 1].toLowerCase();

                const validImageTypes = ['jpg', 'jpeg', 'png', 'gif'];
                const extensionToUse = validImageTypes.includes(fileType) ? fileType : 'jpg';

                const fileName = `${Date.now()}.${extensionToUse}`;

                formData.append('profile_picture', {
                    uri: profilePicture,
                    name: fileName,
                    type: `image/${extensionToUse}`
                });
            }

            const userId = await getUserId();
            if (!userId) {
                const error = new Error('User ID missing from storage');
                error.code = 'USER_ID_MISSING';
                throw error;
            }
            return apiClient.patch(API_CONFIG.ENDPOINTS.USER.UPDATE(userId), formData);
        } catch (error) {
            logger.error('Error in updateProfile:', error);
            if (error.response) {
                logger.error('Response data:', error.response.data);
                logger.error('Response status:', error.response.status);
            }
            throw error;
        }
    },

    createCompany: async (companyData) => {
        try {
            const formData = new FormData();

            Object.keys(companyData).forEach(key => {
                if (key !== 'logo' && companyData[key] !== null && companyData[key] !== undefined && companyData[key] !== '') {
                    formData.append(key, companyData[key].toString());
                }
            });

            if (companyData.logo && typeof companyData.logo === 'string' && companyData.logo.startsWith('file://')) {
                const uriParts = companyData.logo.split('.');
                const fileType = uriParts[uriParts.length - 1].toLowerCase() || 'jpg';

                formData.append('logo', {
                    uri: companyData.logo,
                    name: `${Date.now()}.${fileType}`,
                    type: `image/${fileType}`,
                });
            }

            const response = await apiClient.post(API_CONFIG.ENDPOINTS.COMPANY.CREATE, formData);
            return response.data;
        } catch (error) {
            logger.error('Create company error:', error);
            if (error.response) {
                logger.error('Create company response data:', error.response.data);
                logger.error('Create company response status:', error.response.status);
            }
            throw error;
        }
    },

    updateCompany: async (companyId, companyData) => {
        try {
            const formData = new FormData();

            Object.keys(companyData).forEach(key => {
                if (key !== 'logo' && companyData[key] !== null && companyData[key] !== undefined && companyData[key] !== '') {
                    formData.append(key, companyData[key].toString());
                }
            });

            if (companyData.logo && typeof companyData.logo === 'string' && companyData.logo.startsWith('file://')) {
                const uriParts = companyData.logo.split('.');
                const fileType = uriParts[uriParts.length - 1].toLowerCase() || 'jpg';

                formData.append('logo', {
                    uri: companyData.logo,
                    name: `${Date.now()}.${fileType}`,
                    type: `image/${fileType}`,
                });
            }

            const response = await apiClient.patch(API_CONFIG.ENDPOINTS.COMPANY.UPDATE(companyId), formData);
            return response.data;
        } catch (error) {
            logger.error('Update company error:', error);
            if (error.response) {
                logger.error('Update company response data:', error.response.data);
                logger.error('Update company response status:', error.response.status);
            }
            throw error;
        }
    },

    getCompany: async (companyId) => {
        try {
            const response = await apiClient.get(API_CONFIG.ENDPOINTS.COMPANY.GET(companyId));

            if (response.data.logo) {
                response.data.logo = getUploadUrl(API_CONFIG.UPLOAD_PATHS.COMPANY_LOGO, response.data.logo);
            }

            return response.data;
        } catch (error) {
            logger.error('Get company error:', error);
            throw error;
        }
    },

};

export default userService;