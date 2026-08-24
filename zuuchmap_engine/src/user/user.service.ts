import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Post } from '../post/entities/post.entity';
import { PushDevice } from './entities/push-device.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { deleteSingleImage } from '../utils/uploader';

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
  ) { }

  async findByPhoneNumber(phone_number: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { phone_number },
        relations: ['company']
      });

      return user;
    } catch (error) {
      this.logger.error(`Failed to find user by phone number ${phone_number}: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve user by phone number: ' + error.message);
    }
  }

  async setUserType(phone_number: string, type: string): Promise<{ success: boolean; message: string; user?: User }> {
    try {
      const user = await this.userRepository.findOne({
        where: { phone_number },
        relations: ['company']
      });

      if (!user) {
        throw new NotFoundException(`User with phone number ${phone_number} not found`);
      }

      user.type = type;
      const savedUser = await this.userRepository.save(user);

      return {
        success: true,
        message: `Successfully set user type to ${type}`,
        user: savedUser
      };
    } catch (error) {
      this.logger.error(`Failed to set user type for ${phone_number}: ${error.message}`);

      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to set user type: ' + error.message);
    }
  }

  async getUserPosts(userId: string) {
    // Counters come from COUNT queries; loading every row to count in JS
    // scaled linearly with the user's post history.
    const [posts, totalPosts, activePosts] = await Promise.all([
      this.postRepository.find({
        where: { user: { id: userId } },
        order: { date_created: 'DESC' },
        take: 200,
      }),
      this.postRepository.count({ where: { user: { id: userId } } }),
      this.postRepository.count({
        where: { user: { id: userId }, approval_status: 'APPROVED', status: 'ACTIVE' as any },
      }),
    ]);
    return { totalPosts, activePosts, posts };
  }

  async findAll(): Promise<User[]> {
    try {
      // Admin list view; capped until the UI paginates.
      return await this.userRepository.find({
        relations: ['company'],
        order: { date_created: 'DESC' },
        take: 500,
      });
    } catch (error) {
      this.logger.error(`Failed to retrieve all users: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve users: ' + error.message);
    }
  }

  async findOne(id: string): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id },
        relations: ['company'],
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to retrieve user ${id}: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve user: ' + error.message);
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto, profilePicture?: string | null): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id },
        relations: ['company']
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      Object.assign(user, updateUserDto);

      if (profilePicture) {
        if (user.profile_picture) {
          await deleteSingleImage(user.profile_picture);
        }
        user.profile_picture = profilePicture;
      }

      return this.userRepository.save(user);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update user ${id}: ${error.message}`);
      throw new InternalServerErrorException('Failed to update user: ' + error.message);
    }
  }

  /**
   * Binds one device to this account. The token is unique across the table, so
   * a device that previously belonged to another account moves here rather than
   * leaving the old owner able to push to someone else's phone.
   */
  async savePushToken(userId: string, pushToken: string, platform?: string): Promise<void> {
    try {
      await this.pushDeviceRepository.upsert(
        { user: { id: userId } as User, token: pushToken, platform: platform ?? null, last_seen_at: new Date() },
        { conflictPaths: ['token'], skipUpdateIfNoValuesChanged: false },
      );
    } catch (error) {
      this.logger.error(`Failed to save push token for user ${userId}: ${error.message}`);
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
        pushToken ? { user: { id: userId } as User, token: pushToken } : { user: { id: userId } as User },
      );
    } catch (error) {
      this.logger.error(`Failed to remove push token for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id } });
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
        .where('user_id = :id AND status != :expired AND (expires_at IS NULL OR expires_at > :gracedAt)', {
          id, expired: 'EXPIRED', gracedAt,
        })
        .execute();

      await this.userRepository.delete(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete user ${id}: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete user: ' + error.message);
    }
  }
}