import { forgetSessionUser } from '../utils/session';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Post } from '../post/entities/post.entity';
import { countActivePosts } from '../post/active-posts';
import { PushDevice } from './entities/push-device.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { deleteSingleImage } from '../utils/uploader';
import { CompanyService } from '../company/company.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(PushDevice)
    private readonly pushDeviceRepository: Repository<PushDevice>,
    private readonly companyService: CompanyService,
  ) {}

  async setUserType(
    phone_number: string,
    type: string,
  ): Promise<{ success: boolean; message: string; user?: User }> {
    const user = await this.userRepository.findOne({
      where: { phone_number },
      relations: ['company'],
    });

    if (!user) {
      throw new NotFoundException(
        `User with phone number ${phone_number} not found`,
      );
    }

    // A role is chosen once, at onboarding. Re-sending the same one is harmless
    // (a retried request); changing it is not — a provider turned customer
    // keeps live listings under an account the clients treat as a buyer, and
    // nothing in either client offers the switch.
    if (user.type && user.type !== type) {
      throw new ConflictException({
        message: 'Account type is already set.',
        code: 'ROLE_ALREADY_SET',
      });
    }

    user.type = type;
    const savedUser = await this.userRepository.save(user);

    return {
      success: true,
      message: `Successfully set user type to ${type}`,
      user: savedUser,
    };
  }

  async getUserPosts(userId: string) {
    // Two counters and nothing else. This also shipped up to 200 full post rows
    // that the one caller — the provider profile's two stat tiles — never read;
    // the list itself is `GET /posts/mine`.
    const [totalPosts, activePosts] = await Promise.all([
      this.postRepository.count({ where: { user: { id: userId } } }),
      // Same definition the quota card enforces — see active-posts.ts.
      countActivePosts(this.postRepository, userId),
    ]);
    return { totalPosts, activePosts };
  }

  async findAll(): Promise<User[]> {
    // Admin list view; capped until the UI paginates.
    return this.userRepository.find({
      relations: ['company'],
      order: { date_created: 'DESC' },
      take: 500,
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['company'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    profilePicture?: string | null,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['company'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    Object.assign(user, updateUserDto);

    const oldPicture = user.profile_picture;
    if (profilePicture) user.profile_picture = profilePicture;

    let saved: User;
    try {
      saved = await this.userRepository.save(user);
    } catch (error) {
      if (profilePicture) await deleteSingleImage(profilePicture);
      throw error;
    }
    // Only once the row no longer points at it — deleting first left a broken
    // avatar whenever the save failed.
    if (profilePicture && oldPicture) await deleteSingleImage(oldPicture);
    return saved;
  }

  /**
   * Binds one device to this account. The token is unique across the table, so
   * a device that previously belonged to another account moves here rather than
   * leaving the old owner able to push to someone else's phone.
   */
  async savePushToken(
    userId: string,
    pushToken: string,
    platform?: string,
    locale?: string,
  ): Promise<void> {
    try {
      await this.pushDeviceRepository.upsert(
        {
          user: { id: userId } as User,
          token: pushToken,
          platform: platform ?? null,
          // Only when stated: an older build re-registering must not blank it.
          ...(locale ? { locale } : {}),
          last_seen_at: new Date(),
        },
        { conflictPaths: ['token'], skipUpdateIfNoValuesChanged: false },
      );
    } catch (error) {
      this.logger.error(
        `Failed to save push token for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Unbinds a single device on logout.
   *
   * Scoped to the token the caller presents — clearing every device for the
   * account, which is what the old single-column version did, muted phones that
   * were still signed in. A logout with no token (an older client) still clears
   * the whole account, because that build cannot tell us which device it is.
   */
  async removePushToken(userId: string, pushToken?: string): Promise<void> {
    try {
      await this.pushDeviceRepository.delete(
        pushToken
          ? { user: { id: userId } as User, token: pushToken }
          : { user: { id: userId } as User },
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove push token for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Binds a browser to this account for web push.
   *
   * Stored in the same table as an Expo device, keyed on the subscription
   * endpoint — which the Push API already guarantees is unique per browser
   * install — so the whole notification path stays one query and one fan-out
   * regardless of which transport a recipient happens to have.
   */
  async saveWebPushSubscription(
    userId: string,
    endpoint: string,
    keys: { p256dh: string; auth: string },
    locale?: string,
  ): Promise<void> {
    try {
      await this.pushDeviceRepository.upsert(
        {
          user: { id: userId } as User,
          token: endpoint,
          provider: 'WEB',
          web_subscription: { keys } as Record<string, any>,
          platform: 'web',
          ...(locale ? { locale } : {}),
          last_seen_at: new Date(),
        },
        { conflictPaths: ['token'], skipUpdateIfNoValuesChanged: false },
      );
    } catch (error) {
      this.logger.error(
        `Failed to save web push subscription for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['company'],
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.profile_picture) {
      await deleteSingleImage(user.profile_picture);
    }

    // Give active posts a 14-day grace period before they expire
    const gracedAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await this.postRepository
      .createQueryBuilder()
      .update()
      .set({ expires_at: gracedAt })
      .where(
        '"userId" = :id AND status != :expired AND (expires_at IS NULL OR expires_at > :gracedAt)',
        {
          id,
          expired: 'EXPIRED',
          gracedAt,
        },
      )
      .execute();

    await this.userRepository.delete(id);
    if (user.company) await this.companyService.removeIfOrphaned(user.company.id);
    // Their token is still cryptographically valid; stop honouring it now.
    forgetSessionUser(id);
  }
}
