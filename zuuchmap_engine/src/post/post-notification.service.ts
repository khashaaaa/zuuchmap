import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { PushDevice } from '../user/entities/push-device.entity';
import { sendPushMessages, sendPushNotifications } from '../utils/pushNotification';
import { getAdminPhones } from '../admin/admin.guard';

/**
 * Push-notification fan-out for post and booking events.
 *
 * Split out of PostService so that CRUD/query code doesn't carry the
 * notification concern. Delivery failures are always non-fatal — callers
 * must never have a write rolled back because a push didn't land.
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

  async notifyAdmins(postId: number, title: string, category?: string): Promise<void> {
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

  async notifyUsers(userIds: string[], title: string, body: string, data?: Record<string, any>): Promise<void> {
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
    items: Array<{ userId: string; title: string; body: string; data?: Record<string, any> }>,
  ): Promise<number> {
    if (!items.length) return 0;
    try {
      const devices = await this.pushDeviceRepository.find({
        where: { user: { id: In(items.map((i) => i.userId)) } },
        select: ['id', 'token'],
        relations: ['user'],
      });
      const byUser = new Map<string, string[]>();
      for (const d of devices) {
        if (!d.token?.startsWith('ExponentPushToken') || !d.user?.id) continue;
        const list = byUser.get(d.user.id) ?? [];
        list.push(d.token);
        byUser.set(d.user.id, list);
      }

      // Every device of every recipient, each carrying that recipient's payload.
      const messages = items.flatMap((item) =>
        (byUser.get(item.userId) ?? []).map((to) => ({
          to, title: item.title, body: item.body, data: item.data,
        })),
      );
      if (!messages.length) return 0;

      const { delivered, deadTokens } = await sendPushMessages(messages);
      if (deadTokens.length) {
        this.logger.warn(`Removing ${deadTokens.length} dead push device(s)`);
        await this.pushDeviceRepository
          .delete({ token: In(deadTokens) })
          .catch((err) => this.logger.warn(`Failed to remove dead devices: ${err?.message}`));
      }
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
    const qb = this.userRepository.createQueryBuilder('u')
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
    const sent = await this.dispatch(users.map((u) => u.id), title, body, { notifType: 'broadcast' });
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
      select: ['id', 'token'],
    });
    const targets = devices.filter(d => d.token?.startsWith('ExponentPushToken'));
    if (!targets.length) return 0;

    const { delivered, deadTokens } = await sendPushNotifications(
      targets.map(d => d.token), title, body, data,
    );

    if (deadTokens.length) {
      this.logger.warn(`Removing ${deadTokens.length} dead push device(s)`);
      await this.pushDeviceRepository
        .delete({ token: In(deadTokens) })
        .catch(err => this.logger.warn(`Failed to remove dead devices: ${err?.message}`));
    }

    // The transport's own count, not targets-minus-dead: a batch that fails on
    // the HTTP call yields neither a ticket nor a dead token, and subtracting
    // reported those devices as reached. `delivered` counts tickets Expo
    // actually accepted.
    return delivered;
  }
}
