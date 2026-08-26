import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api.config';

// A new post is a long form — photos, location, dynamic fields. Losing it to a
// backgrounded app or a phone call meant starting over, so the form state is
// written to disk as the provider types and offered back on the next visit.
//
// One draft per category key: the fields differ between verticals, so a
// machinery draft restored into a job-vacancy form would be nonsense. Images
// are stored as URIs only (never binaries) — a picked file's `file://` URI
// stays readable for the life of the app's cache, and a remote URL always does.
// Edits are never drafted: the server already holds that post.

const DRAFT_KEY = API_CONFIG.STORAGE_KEYS.POST_DRAFT;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const keyFor = (category) => `${DRAFT_KEY}:${String(category ?? '').toLowerCase()}`;

// Dates serialise to ISO strings — `getInitialFormData` seeds Date objects
// for availability, and the form reads them back through `new Date(...)`,
// so the round trip is lossless.
const serialisable = (data) => {
    const out = {};
    Object.entries(data ?? {}).forEach(([k, v]) => {
        if (v instanceof Date) out[k] = v.toISOString();
        else if (k === 'images') out[k] = (Array.isArray(v) ? v : []).filter((u) => typeof u === 'string');
        else out[k] = v;
    });
    return out;
};

export const saveDraft = (category, data) =>
    AsyncStorage.setItem(
        keyFor(category),
        JSON.stringify({ category, data: serialisable(data), savedAt: Date.now() }),
    ).catch(() => {});

/** @returns {Promise<{data: object, savedAt: number} | null>} */
export const readDraft = async (category) => {
    try {
        const raw = await AsyncStorage.getItem(keyFor(category));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.data) return null;
        // A week-old draft is stale enough that restoring it would surprise.
        if (Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) {
            clearDraft(category);
            return null;
        }
        return { data: parsed.data, savedAt: parsed.savedAt ?? Date.now() };
    } catch {
        return null;
    }
};

export const clearDraft = (category) => AsyncStorage.removeItem(keyFor(category)).catch(() => {});

/**
 * Drops every draft, whatever category it belongs to.
 *
 * Called on sign-out. The key carries a category but no user, and a draft holds
 * a title, details, price, contact phone, location and picked photo URIs — so
 * on a shared handset the next person to sign in was offered the previous
 * provider's unfinished listing, for up to the seven days MAX_AGE_MS allows.
 */
export const clearAllDrafts = async () => {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const mine = keys.filter((k) => k.startsWith(`${DRAFT_KEY}:`));
        if (mine.length) await AsyncStorage.multiRemove(mine);
    } catch {
        // Storage unavailable — nothing to clear, and sign-out must not fail on it.
    }
};
