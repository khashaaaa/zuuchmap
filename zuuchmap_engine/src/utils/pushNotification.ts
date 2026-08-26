import { Logger } from '@nestjs/common';

const logger = new Logger('PushNotification');

/** Expo accepts up to 100 messages per request; one-per-token wastes 99% of that. */
const EXPO_BATCH = 100;
const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** One Expo message: a token plus the payload that belongs to it. */
export interface PushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, any>;
}

/**
 * Send many *different* messages, batched the same way.
 *
 * Expo accepts a heterogeneous array in one request, which is what a per-user
 * payload needs: the review-prompt sweep sends every customer their own
 * bookingId, and calling the single-payload helper once per customer turned
 * one request into one per recipient.
 */
export async function sendPushMessages(
    messages: PushMessage[],
): Promise<{ delivered: number; deadTokens: string[] }> {
    const valid = messages.filter(m => m?.to?.startsWith('ExponentPushToken'));
    const deadTokens: string[] = [];
    let delivered = 0;

    for (let i = 0; i < valid.length; i += EXPO_BATCH) {
        const chunk = valid.slice(i, i + EXPO_BATCH);
        try {
            const response = await fetch(EXPO_ENDPOINT, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(chunk.map(m => ({
                    to: m.to, sound: 'default', title: m.title, body: m.body, data: m.data ?? {},
                }))),
            });
            if (!response.ok) {
                logger.warn(`Push batch failed: HTTP ${response.status} (${chunk.length} messages)`);
                continue;
            }
            const payload = await response.json().catch(() => null);
            const tickets = Array.isArray(payload?.data) ? payload.data : [];
            chunk.forEach((message, idx) => {
                const ticket = tickets[idx];
                if (ticket?.status === 'error') {
                    const code = ticket.details?.error ?? 'unknown';
                    logger.warn(`Push ticket error (${code}): ${ticket.message ?? ''}`);
                    if (code === 'DeviceNotRegistered') deadTokens.push(message.to);
                } else if (ticket) {
                    delivered++;
                }
            });
        } catch (error) {
            logger.error(`Failed to send push batch: ${error.message}`);
        }
    }

    return { delivered, deadTokens };
}

/**
 * Send one notification to many tokens, batched.
 *
 * A broadcast used to be one HTTP round-trip per recipient — 288 requests for
 * 288 users, and the admin's own request blocked on all of them. Batching turns
 * that into ceil(n/100) requests.
 *
 * Returns the tokens Expo reported as no longer registered, so the caller can
 * clear them; ticket order matches message order, which is what lets a ticket
 * be attributed back to its token.
 */
export async function sendPushNotifications(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
): Promise<{ delivered: number; deadTokens: string[] }> {
    return sendPushMessages(tokens.map(to => ({ to, title, body, data })));
}
