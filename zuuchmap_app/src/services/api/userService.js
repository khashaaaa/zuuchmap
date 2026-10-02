import axios from 'axios';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, getUploadUrl } from '../../config/api.config';
import { getAuthToken, getUserId, getUserInfo, getUserType, storeAuthData, emitAuthChanged, onAuthChanged, rememberAuthToken } from './authHelpers';
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
    // The remembered session answer still says "no role" for this token; the
    // dashboard read it on mount and hid every save button for a new customer.
    emitAuthChanged();

    if (navigation) {
        navigateToDashboard(navigation, selectedRole);
    }
};

const AUTH_CHECK_TTL_MS = 60 * 1000;
let authCheck = null;
onAuthChanged(() => { authCheck = null; });

/** What storage says about the session, for when the server cannot be asked. */
const storedSession = async () => {
    const [userType, info] = await Promise.all([getUserType(), getUserInfo()]);
    return {
        authenticated: true,
        roleSelected: !!userType,
        userType,
        is_admin: info?.is_admin === true,
        unverified: true,
    };
};

const verifySession = async () => {
    try {
        const response = await apiClient.get(API_CONFIG.ENDPOINTS.USER.PROFILE);
        const type = response.data?.type;
        if (!type) return storedSession();
        if ((await getUserType()) !== type) {
            await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_TYPE, type);
        }
        return { authenticated: true, roleSelected: true, userType: type, is_admin: response.data.is_admin === true };
    } catch (error) {
        if (error.response?.status === 401) return { authenticated: false, roleSelected: false };
        logger.warn('Profile check unanswered, trusting the stored session:', error?.message);
        return storedSession();
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

    /**
     * Whether there is a session, and whose.
     *
     * Only a 401 means "no". This used to report *any* failure — no signal, a
     * timeout, a 429, a 500 — as signed out, so a provider opening the app in a
     * basement was shown the guest catalogue with a valid token in storage. A
     * token that really has died is caught by the interceptor on the first
     * request that gets through, which clears the session and resets to login.
     *
     * The answer is kept for a minute per token. App start and the first two
     * tabs each asked, and each ask was its own `GET /user/profile`.
     */
    isAuthenticated: async () => {
        const token = await getAuthToken();
        if (!token) return { authenticated: false, roleSelected: false };

        if (authCheck && authCheck.token === token && Date.now() - authCheck.at < AUTH_CHECK_TTL_MS) {
            return authCheck.result;
        }
        const result = verifySession().then((answer) => {
            // A refusal is never remembered: the next ask should go and look.
            if (!answer.authenticated && authCheck?.result === result) authCheck = null;
            return answer;
        });
        authCheck = { token, at: Date.now(), result };
        return result;
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
            rememberAuthToken(null);
            // PUSH_ASKED goes too: it is device-scoped, but it gates the in-app
            // rationale, and the next account on this phone is a different person
            // who has been asked nothing. The OS prompt stays protected by
            // `canAskAgain`, so clearing this cannot spend a permission twice.
            AsyncStorage.multiRemove([
                API_CONFIG.STORAGE_KEYS.PUSH_TOKEN,
                API_CONFIG.STORAGE_KEYS.PUSH_ASKED,
            ]).catch(() => {});
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
                // null, not a placeholder URL: <Avatar> draws the fallback
                // locally. Substituting a remote "U" image here meant every
                // caller saw a truthy profilePicture and no screen could tell
                // "has a photo" from "has none".
                profilePicture: response.data.profile_picture
                    ? getUploadUrl(API_CONFIG.UPLOAD_PATHS.PROFILE_PICTURE, response.data.profile_picture)
                    : null,
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
                plan: response.data.plan,
                plan_expires_at: response.data.plan_expires_at,

                totalPosts: response.data.totalPosts || 0,
                activePosts: response.data.activePosts || 0,

                memberSince: (() => {
                    const date = new Date(response.data.date_created);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    // `.` is the app's date separator everywhere else (see displayUtils).
                    return `${year}.${month}`;
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