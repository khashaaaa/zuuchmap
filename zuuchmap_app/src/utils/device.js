import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { API_CONFIG } from '../config/api.config';

const memo = {};

async function stableId(key) {
    if (memo[key]) return memo[key];
    try {
        const existing = await AsyncStorage.getItem(key);
        if (existing) {
            memo[key] = existing;
            return existing;
        }
        const fresh = Crypto.randomUUID();
        await AsyncStorage.setItem(key, fresh);
        memo[key] = fresh;
        return fresh;
    } catch {
        // Storage unavailable — a per-launch id keeps the request valid, the
        // user just verifies again next time.
        memo[key] = Crypto.randomUUID();
        return memo[key];
    }
}

/**
 * Identifies this install to the auth flow so a returning user skips SMS
 * verification (and its 150₮ charge). The engine stores only a hash of it.
 */
export const getDeviceId = () => stableId(API_CONFIG.STORAGE_KEYS.DEVICE_ID);

/** Analytics-only pseudonym, unrelated to identity until sign-in. */
export const getAnonId = () => stableId(API_CONFIG.STORAGE_KEYS.ANON_ID);
