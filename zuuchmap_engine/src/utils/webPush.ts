import { Logger } from '@nestjs/common';
import * as webpush from 'web-push';

/**
 * Browser push over VAPID.
 *
 * Env-gated on `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
 * (a mailto: or https: URL identifying the sender, which the spec requires).
 * Generate a pair once with `npx web-push generate-vapid-keys` — the public
 * key is also served to the browser by `GET /user/push/vapid-key`, so the two
 * sides can never drift.
 *
 * With the keys unset every call here is a no-op, exactly like Expo push
 * without a token: a missing transport must degrade to "not delivered", never
 * to a failed request.
 */
const logger = new Logger('WebPush');

export interface WebPushTarget {
  /** The subscription endpoint — also the row's `token`. */
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let configured: boolean | null = null;

export function webPushConfigured(): boolean {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    configured = false;
    return configured;
  }
  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT || 'mailto:support@zuuchmap.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
    );
    configured = true;
  } catch (err: any) {
    // A malformed key pair is a configuration mistake, not a runtime condition —
    // say so once and stay off rather than throwing on every notification.
    logger.error(
      `Invalid VAPID configuration — web push disabled: ${err?.message}`,
    );
    configured = false;
  }
  return configured;
}

export function vapidPublicKey(): string | null {
  return webPushConfigured() ? (process.env.VAPID_PUBLIC_KEY as string) : null;
}

/**
 * Send one payload to many browsers.
 *
 * Returns the endpoints that are permanently gone (404/410) so the caller can
 * delete those rows — the same contract the Expo sender uses, so the dispatch
 * path handles both transports identically.
 */
export async function sendWebPush(
  targets: WebPushTarget[],
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<{ delivered: number; deadTokens: string[] }> {
  if (!webPushConfigured() || !targets.length)
    return { delivered: 0, deadTokens: [] };

  const payload = JSON.stringify({ title, body, data: data ?? {} });
  const deadTokens: string[] = [];
  let delivered = 0;

  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification(
        { endpoint: t.endpoint, keys: t.keys },
        payload,
        // Browsers hold a push for the user; a day is long enough to be useful
        // and short enough that a stale booking alert never arrives.
        { TTL: 86400 },
      ),
    ),
  );

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      delivered += 1;
      return;
    }
    const status = result.reason?.statusCode;
    if (status === 404 || status === 410) {
      // The subscription was revoked — unsubscribed, or the browser data
      // cleared. Keeping it would mean retrying it forever.
      deadTokens.push(targets[i].endpoint);
    } else {
      logger.warn(
        `Web push to ${targets[i].endpoint.slice(0, 60)}… failed: ${status ?? result.reason?.message}`,
      );
    }
  });

  return { delivered, deadTokens };
}
