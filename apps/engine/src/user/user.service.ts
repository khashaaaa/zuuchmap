import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import type { UpdateProfileDto } from './dto/user.dto';

/** Days a deleted account's live listings stay up before they lapse (Figma L3). */
const DELETED_LISTINGS_DAYS = 14;

/**
 * Deletes an account (Figma L3, or an admin in J11d). Its live listings stay up DELETED_LISTINGS_DAYS
 * more and then lapse; sessions, trusted devices, saves, searches, company and push devices go
 * with the row. Signing up again costs a fresh phone verification. Answers false for an unknown id.
 */
export async function deleteAccount(ds: DataSource, userId: string): Promise<boolean> {
  return ds.transaction(async (em) => {
    await em.query(
      `UPDATE posts SET expires_at = LEAST(COALESCE(expires_at, now() + make_interval(days => $2)), now() + make_interval(days => $2)),
              is_featured = false, date_updated = now()
        WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId, DELETED_LISTINGS_DAYS],
    );
    // Drafts and listings never published have nobody to answer for them.
    await em.query(`UPDATE posts SET deleted_at = now() WHERE user_id = $1 AND deleted_at IS NULL AND (is_draft OR approval_status <> 'APPROVED')`, [userId]);
    const res = await em.query<[unknown, number]>('DELETE FROM users WHERE id = $1', [userId]);
    return res[1] > 0;
  });
}

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
