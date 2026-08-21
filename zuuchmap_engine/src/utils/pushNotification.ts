import { Logger } from '@nestjs/common';

const logger = new Logger('PushNotification');

export interface PushResult {
    delivered: boolean;
    /** Expo reported the token is no longer valid — the caller should clear it. */
    deadToken: boolean;
}

export async function sendPushNotification(
    expoPushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>
): Promise<PushResult> {
    if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
        return { delivered: false, deadToken: false };
    }

    const message = {
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
    };

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        if (!response.ok) {
            logger.warn(`Push notification failed: HTTP ${response.status}`);
            return { delivered: false, deadToken: false };
        }

        // Expo returns 200 even when the ticket inside reports an error
        // (DeviceNotRegistered, MessageRateExceeded, …) — HTTP status alone
        // says nothing about delivery.
        const payload = await response.json().catch(() => null);
        const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
        if (ticket?.status === 'error') {
            const code = ticket.details?.error ?? 'unknown';
            logger.warn(`Push ticket error (${code}): ${ticket.message ?? ''}`);
            return { delivered: false, deadToken: code === 'DeviceNotRegistered' };
        }
        return { delivered: true, deadToken: false };
    } catch (error) {
        logger.error(`Failed to send push notification: ${error.message}`);
        return { delivered: false, deadToken: false };
    }
}
