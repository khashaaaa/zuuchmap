import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../../config/api.config';
import { logger } from '../../utils/logger';
import i18n from '../../i18n';
import { queryClient } from '../queryClient';

// Login/logout signal — lets app-lifetime hooks (useNotificationSync) restart
// or tear down without polling AsyncStorage. Fired by storeAuthData,
// clearAuthData and userService.logout.
const authListeners = new Set();

export const onAuthChanged = (listener) => {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
};

export const emitAuthChanged = () => {
    authListeners.forEach((listener) => {
        try { listener(); } catch (error) { logger.error('Auth listener error:', error); }
    });
};

export const getAuthToken = async () => {
    try {
        return await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    } catch (error) {
        logger.error('Error retrieving authentication token:', error);
        return null;
    }
};

export const getUserId = async () => {
    try {
        return await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.USER_ID);
    } catch (error) {
        logger.error('Error retrieving user ID:', error);
        return null;
    }
};

export const getUserType = async () => {
    try {
        return await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.USER_TYPE);
    } catch (error) {
        logger.error('Error retrieving user type:', error);
        return null;
    }
};

export const getPhoneNumber = async () => {
    try {
        return await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.PHONE_NUMBER);
    } catch (error) {
        logger.error('Error retrieving phone number:', error);
        return null;
    }
};

export const getUserInfo = async () => {
    try {
        const userInfo = await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.USER_INFO);
        return userInfo ? JSON.parse(userInfo) : null;
    } catch (error) {
        logger.error('Error retrieving user info:', error);
        return null;
    }
};

// Catch sites branch on `error.code`, never on the (localized) message text.
const authTokenMissingError = () => {
    const error = new Error(i18n.t('errors.authTokenMissing'));
    error.code = 'AUTH_TOKEN_MISSING';
    return error;
};

export const createAuthHeaders = async () => {
    const token = await getAuthToken();
    if (!token) throw authTokenMissingError();
    return { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
};

export const createMultipartAuthHeaders = async () => {
    const token = await getAuthToken();
    if (!token) throw authTokenMissingError();
    return { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } };
};

export const storeAuthData = async (responseData, phoneNumber) => {
    try {
        queryClient.clear();
        if (responseData?.token) await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN, responseData.token);
        if (responseData?.id)    await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_ID, responseData.id);
        if (phoneNumber)         await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.PHONE_NUMBER, phoneNumber);
        if (responseData?.type)  await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_TYPE, responseData.type);

        // Persist is_admin flag so useNotificationSync and profile screens can read it
        // without recomputing from a hardcoded phone list.
        const existingInfo = await AsyncStorage.getItem(API_CONFIG.STORAGE_KEYS.USER_INFO);
        const existing = existingInfo ? JSON.parse(existingInfo) : {};
        const updated = {
            ...existing,
            phone_number: phoneNumber || existing.phone_number,
            is_admin: responseData?.is_admin === true,
        };
        await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_INFO, JSON.stringify(updated));
        emitAuthChanged();
    } catch (error) {
        logger.error('Error storing auth data:', error);
        throw error;
    }
};

export const saveUserInfo = async (phoneNumber, userType, additionalInfo = {}) => {
    try {
        const existing = await getUserInfo() || {};
        const userInfo = { ...existing, phoneNumber, userType, ...additionalInfo };
        await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_INFO, JSON.stringify(userInfo));
        if (userType)    await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.USER_TYPE, userType);
        if (phoneNumber) await AsyncStorage.setItem(API_CONFIG.STORAGE_KEYS.PHONE_NUMBER, phoneNumber);
        return userInfo;
    } catch (error) {
        logger.error('Error saving user info:', error);
        throw error;
    }
};

export const clearAuthData = async () => {
    try {
        await AsyncStorage.multiRemove([
            API_CONFIG.STORAGE_KEYS.AUTH_TOKEN,
            API_CONFIG.STORAGE_KEYS.USER_ID,
            API_CONFIG.STORAGE_KEYS.USER_TYPE,
            API_CONFIG.STORAGE_KEYS.PHONE_NUMBER,
            API_CONFIG.STORAGE_KEYS.USER_INFO,
        ]);
        queryClient.clear();
        emitAuthChanged();
    } catch (error) {
        logger.error('Error clearing auth data:', error);
    }
};
