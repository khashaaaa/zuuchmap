import { Platform, AppState } from 'react-native';
import axios from 'axios';
import { API_CONFIG } from '../config/api.config';
import { getAnonId } from '../utils/device';
import { getAuthToken } from './api/authHelpers';

const FLUSH_MS = 5000;
const MAX_QUEUE = 25;

let queue = [];
let timer = null;

async function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;

    const events = queue;
    queue = [];

    try {
        const [anonId, token] = await Promise.all([getAnonId(), getAuthToken()]);
        await axios.post(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ANALYTICS.COLLECT}`,
            { anon_id: anonId, events },
            token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );
    } catch {
        // Analytics must never surface to the user or retry aggressively —
        // a dropped batch is cheaper than a blocked screen.
    }
}

/**
 * Records a product event. Names match the web client exactly so the admin
 * funnel counts both platforms as one number.
 */
export function track(name, props) {
    queue.push({
        name,
        platform: Platform.OS,
        props,
        occurred_at: new Date().toISOString(),
    });

    if (queue.length >= MAX_QUEUE) { flush(); return; }
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
}


const MAX_REPORTS = 10;
let reported = 0;
const seenErrors = new Set();

/**
 * Crash reporting over the analytics pipe we already have — no third-party SDK
 * and no native rebuild. Without it a crash on a user's phone is invisible to
 * us forever: `logger.error` is compiled out of release builds.
 *
 * Capped and deduped so a render loop cannot become a request loop.
 */
export function reportError(error, context) {
    try {
        if (reported >= MAX_REPORTS) return;
        const message = String(error?.message ?? error ?? 'unknown').slice(0, 300);
        const key = `${context}|${message}`;
        if (seenErrors.has(key)) return;
        seenErrors.add(key);
        reported++;

        track('client.error', {
            message,
            context,
            stack: typeof error?.stack === 'string' ? error.stack.slice(0, 1000) : undefined,
        });
        flush();
    } catch {
        // The reporter must never become the thing that breaks the app.
    }
}

// Send whatever is buffered before the OS suspends the app.
AppState.addEventListener('change', (state) => {
    if (state !== 'active') flush();
});
