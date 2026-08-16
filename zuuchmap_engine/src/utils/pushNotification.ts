import { Logger } from '@nestjs/common';

const logger = new Logger('PushNotification');

export async function sendPushNotification(
    expoPushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>
): Promise<void> {
    if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
        return;
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
            logger.warn(`Push notification failed: ${response.status}`);
        }
    } catch (error) {
        logger.error(`Failed to send push notification: ${error.message}`);
    }
}
