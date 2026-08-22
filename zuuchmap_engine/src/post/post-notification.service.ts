import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { sendPushNotification } from '../utils/pushNotification';
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
  ) {}

  async notifyAdmins(postId: number, title: string, category?: string): Promise<void> {
    try {
      const adminPhones = getAdminPhones();
      if (!adminPhones.length) return;
      const admins = await this.userRepository.find({
        where: { phone_number: In(adminPhones) },
        select: ['id', 'push_token'],
      });
      await this.dispatch(
        admins,
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
      const users = await this.userRepository.find({
        where: { id: In(userIds) },
        select: ['id', 'push_token'],
      });
      await this.dispatch(users, title, body, data);
    } catch (err) {
      this.logger.warn(`notifyUsers failed (non-fatal): ${err?.message}`);
    }
  }

  // Sends to each user and clears tokens Expo reports as DeviceNotRegistered,
  // so dead tokens don't accumulate and every delivery failure leaves a log line.
  private async dispatch(
    users: Pick<User, 'id' | 'push_token'>[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    const targets = users.filter(u => u.push_token?.startsWith('ExponentPushToken'));
    // Cap concurrency — an unbounded Promise.all is one HTTP call per user.
    const CHUNK = 20;
    for (let i = 0; i < targets.length; i += CHUNK) {
      await Promise.all(
        targets.slice(i, i + CHUNK).map(async (u) => {
          const result = await sendPushNotification(u.push_token, title, body, data);
          if (result.deadToken) {
            this.logger.warn(`Clearing dead push token for user ${u.id}`);
            await this.userRepository
              .update(u.id, { push_token: null as unknown as string })
              .catch(err => this.logger.warn(`Failed to clear dead token: ${err?.message}`));
          }
        }),
      );
    }
  }
}
