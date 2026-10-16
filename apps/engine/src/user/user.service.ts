import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import type { UpdateProfileDto } from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findByPhone(phone: string): Promise<User | null> {
    return this.repo.findOne({ where: { phone_number: phone } });
  }

  async getById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Insert-or-ignore against the unique phone index, then read: never read-then-write, so
   * two sessions finishing for one new number still yield exactly one account.
   */
  async findOrCreateByPhone(phone: string, manager?: EntityManager): Promise<User> {
    const repo = manager ? manager.getRepository(User) : this.repo;
    await repo
      .createQueryBuilder()
      .insert()
      .values({ phone_number: phone, is_verified: true })
      .orIgnore()
      .execute();
    const user = await repo.findOneByOrFail({ phone_number: phone });
    if (user.is_verified !== true) {
      await repo.update({ id: user.id }, { is_verified: true });
      user.is_verified = true;
    }
    return user;
  }

  /**
   * The role is chosen once. PROVIDER is set by one conditional update (role_set_at IS NULL),
   * so concurrent first listings race safely. Repeating the same role is a harmless retry;
   * any other change is ROLE_ALREADY_SET.
   */
  async setRole(userId: string, type: 'PROVIDER' | 'CUSTOMER'): Promise<User> {
    if (type === 'PROVIDER') {
      await this.repo
        .createQueryBuilder()
        .update(User)
        .set({ type: 'PROVIDER', role_set_at: () => 'now()' })
        .where('id = :id AND role_set_at IS NULL', { id: userId })
        .execute();
    }
    const user = await this.getById(userId);
    // CUSTOMER is what everyone starts as; asking for it before any choice is a no-op.
    if (user.type !== type) {
      throw new ConflictException({ message: 'Account type is already set', code: 'ROLE_ALREADY_SET' });
    }
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const patch: Partial<Pick<User, 'given_name' | 'parent_name' | 'email' | 'address'>> = {};
    for (const key of ['given_name', 'parent_name', 'email', 'address'] as const) {
      const v = dto[key];
      if (v === undefined) continue;
      patch[key] = v === null || v.trim() === '' ? null : v.trim();
    }
    if (Object.keys(patch).length > 0) await this.repo.update({ id: userId }, patch);
    return this.getById(userId);
  }

  async list(page: number, limit: number): Promise<{ items: User[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      order: { date_created: 'DESC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }
}
