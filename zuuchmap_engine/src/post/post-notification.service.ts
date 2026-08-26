import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { PushDevice } from '../user/entities/push-device.entity';
import {
  sendPushMessages,
  sendPushNotifications,
} from '../utils/pushNotification';
import {
  sendWebPush,
  WebPushTarget,
  webPushConfigured,
} from '../utils/webPush';
import { sendMail, mailerConfigured } from '../utils/mailer';
import { getAdminPhones } from '../admin/admin.guard';

/**
 * Notification fan-out for post, booking and message events.
 *
 * Split out of PostService so that CRUD/query code doesn't carry the
 * notification concern. Delivery failures are always non-fatal — callers
 * must never have a write rolled back because a push didn't land.
 *
 * Three transports, tried in that order of directness:
 *  - Expo push, for the mobile app;
 *  - Web push (VAPID), for browsers — a provider who works from the website
 *    used to receive nothing once the tab was closed;
 *  - email, only when an account has no registered device at all and has an
 *    address on file. Signup is phone-based, so most accounts have neither
 *    and simply get nothing here — which the in-app inbox still covers.
 * Each is env-gated and independently absent without affecting the others.
 */
@Injectable()
export class PostNotificationService {
  private readonly logger = new Logger(PostNotificationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PushDevice)
    private readonly pushDeviceRepository: Repository<PushDevice>,
  ) {}

  async notifyAdmins(
    postId: number,
    title: string,
    category?: string,
  ): Promise<void> {
    try {
      const adminPhones = getAdminPhones();
      if (!adminPhones.length) return;
      const admins = await this.userRepository.find({
        where: { phone_number: In(adminPhones) },
        select: ['id'],
      });
      await this.dispatch(
        admins.map((u) => u.id),
        'Шинэ зар бүртгэгдлээ',
        `"${title}" – шинэ зар шалгана уу.`,
        { postId, post_type: category, notifType: 'new_post' },
      );
    } catch (err) {
      this.logger.warn(`notifyAdmins failed (non-fatal): ${err?.message}`);
    }
  }

  async notifyUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    if (!userIds.length) return;
    try {
      await this.dispatch(userIds, title, body, data);
    } catch (err) {
      this.logger.warn(`notifyUsers failed (non-fatal): ${err?.message}`);
    }
  }

  /**
   * One push per recipient, each with its own payload, in one batched request.
   *
   * The nightly review sweep needs a distinct bookingId per customer, so it
   * called notifyUsers once per booking — one HTTPS round-trip to Expo per
   * recipient, awaited in a loop, when the transport batches a hundred
   * messages per request. Device lookup is one query for the whole set too.
   */
  async notifyEach(
    items: Array<{
      userId: string;
      title: string;
      body: string;
      data?: Record<string, any>;
    }>,
  ): Promise<number> {
    if (!items.length) return 0;
    try {
      const devices = await this.pushDeviceRepository.find({
        where: { user: { id: In(items.map((i) => i.userId)) } },
        select: ['id', 'token', 'provider', 'web_subscription'],
        relations: ['user'],
      });

      const byUser = new Map<string, typeof devices>();
      for (const d of devices) {
        if (!d.user?.id) continue;
        const list = byUser.get(d.user.id) ?? [];
        list.push(d);
        byUser.set(d.user.id, list);
      }

      // Every device of every recipient, each carrying that recipient's payload.
      const messages: Array<{
        to: string;
        title: string;
        body: string;
        data?: Record<string, any>;
      }> = [];
      const webSends: Array<
        Promise<{ delivered: number; deadTokens: string[] }>
      > = [];
      for (const item of items) {
        const { expo, web } = splitTargets(byUser.get(item.userId) ?? []);
        messages.push(
          ...expo.map((to) => ({
            to,
            title: item.title,
            body: item.body,
            data: item.data,
          })),
        );
        // Web push carries one payload per request, so a per-recipient payload
        // cannot batch the way Expo's heterogeneous array does. Issued in
        // parallel rather than awaited in a loop, which is the part that mattered.
        if (web.length)
          webSends.push(sendWebPush(web, item.title, item.body, item.data));
      }

      let delivered = 0;
      const dead: string[] = [];
      if (messages.length) {
        const res = await sendPushMessages(messages);
        delivered += res.delivered;
        dead.push(...res.deadTokens);
      }
      for (const res of await Promise.all(webSends)) {
        delivered += res.delivered;
        dead.push(...res.deadTokens);
      }
      await this.pruneDeadTokens(dead);
      return delivered;
    } catch (err) {
      this.logger.warn(`notifyEach failed (non-fatal): ${err?.message}`);
      return 0;
    }
  }

  /**
   * Admin broadcast (campaigns: seasonal pushes, announcements). Targets every
   * user holding a push token, optionally narrowed by user type and/or to
   * owners of posts in one category. Returns how many devices were addressed.
   */
  async broadcast(
    title: string,
    body: string,
    opts: { user_type?: string; category?: string } = {},
  ): Promise<{ sent: number }> {
    const qb = this.userRepository
      .createQueryBuilder('u')
      .select(['u.id'])
      .where(`EXISTS (SELECT 1 FROM "push_device" d WHERE d."userId" = u.id)`);
    if (opts.user_type === 'PROVIDER' || opts.user_type === 'CUSTOMER') {
      qb.andWhere('u.type = :t', { t: opts.user_type });
    }
    if (opts.category) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM "post" p WHERE p."userId" = u.id AND p.category = :cat)`,
        { cat: opts.category },
      );
    }
    const users = await qb.getMany();
    // Report what actually went out. `users.length` counted the query result,
    // so a campaign to a list full of stale tokens reported total success.
    const sent = await this.dispatch(
      users.map((u) => u.id),
      title,
      body,
      { notifType: 'broadcast' },
    );
    return { sent };
  }

  /**
   * Sends to every device the given accounts have registered.
   *
   * Takes user ids rather than user rows because the tokens no longer live on
   * the user: one account can hold several devices, and all of them are
   * addressed. One batched request per 100 devices (Expo's limit), and dead
   * tokens are deleted in a single statement rather than one each.
   *
   * Returns the number of devices the push actually reached.
   */
  private async dispatch(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<number> {
    if (!userIds.length) return 0;

    const devices = await this.pushDeviceRepository.find({
      where: { user: { id: In(userIds) } },
      select: ['id', 'token', 'provider', 'web_subscription'],
      relations: ['user'],
    });

    const { expo, web } = splitTargets(devices);
    let delivered = 0;
    const dead: string[] = [];

    if (expo.length) {
      const res = await sendPushNotifications(expo, title, body, data);
      delivered += res.delivered;
      dead.push(...res.deadTokens);
    }
    if (web.length) {
      const res = await sendWebPush(web, title, body, data);
      delivered += res.delivered;
      dead.push(...res.deadTokens);
    }

    await this.pruneDeadTokens(dead);

    // Only for accounts that had nowhere to push at all — an email beside a
    // delivered push is a duplicate, not a fallback.
    const reached = new Set(devices.map((d) => d.user?.id).filter(Boolean));
    await this.emailFallback(
      userIds.filter((id) => !reached.has(id)),
      title,
      body,
    );

    // The transports' own counts, not targets-minus-dead: a batch that fails on
    // the HTTP call yields neither a ticket nor a dead token, and subtracting
    // reported those devices as reached.
    return delivered;
  }

  private async pruneDeadTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    this.logger.warn(`Removing ${tokens.length} dead push device(s)`);
    await this.pushDeviceRepository
      .delete({ token: In(tokens) })
      .catch((err) =>
        this.logger.warn(`Failed to remove dead devices: ${err?.message}`),
      );
  }

  /**
   * Last resort for accounts with no device registered anywhere.
   *
   * Bounded at 50 recipients: this exists so a single booking request reaches
   * someone who only ever uses the website, not so a broadcast turns into a
   * bulk mailing that gets the domain listed as a spam source.
   */
  private async emailFallback(
    userIds: string[],
    subject: string,
    text: string,
  ): Promise<void> {
    if (!mailerConfigured() || !userIds.length || userIds.length > 50) return;
    try {
      const users = await this.userRepository.find({
        where: { id: In(userIds) },
        select: ['id', 'email'],
      });
      const withEmail = users.filter((u) => !!u.email);
      await Promise.all(
        withEmail.map((u) =>
          sendMail({
            to: u.email,
            subject: `ZuuchMap — ${subject}`,
            text: `${text}\n\nzuuchmap.com`,
          }),
        ),
      );
    } catch (err: any) {
      this.logger.warn(`Email fallback failed (non-fatal): ${err?.message}`);
    }
  }
}

/**
 * Sort registered devices into the transport each one speaks.
 *
 * A row is only a target if it actually carries what its transport needs — an
 * Expo row without an ExponentPushToken, or a WEB row whose keys never made it
 * into the column, would otherwise be counted as addressed and silently drop.
 */
export function splitTargets(
  devices: Array<{
    token: string;
    provider?: string;
    web_subscription?: Record<string, any> | null;
  }>,
): { expo: string[]; web: WebPushTarget[] } {
  const expo: string[] = [];
  const web: WebPushTarget[] = [];
  for (const d of devices) {
    if (!d?.token) continue;
    if (d.provider === 'WEB') {
      const keys = d.web_subscription?.keys;
      if (webPushConfigured() && keys?.p256dh && keys?.auth) {
        web.push({
          endpoint: d.token,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
        });
      }
      continue;
    }
    if (d.token.startsWith('ExponentPushToken')) expo.push(d.token);
  }
  return { expo, web };
}
