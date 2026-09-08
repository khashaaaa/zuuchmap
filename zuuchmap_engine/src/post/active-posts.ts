import { EntityManager, Repository } from 'typeorm';
import { Status } from '../enums/status';
import { Post } from './entities/post.entity';

/**
 * The single definition of "an owner's live listings".
 *
 * Everything that is not rejected, not expired and still inside its window —
 * so a post awaiting moderation counts, because it is already holding a slot
 * the owner cannot reuse.
 *
 * This is the number the quota is enforced against (`PostService.assertQuota`)
 * *and* the number the profile shows, and it exists as a free function so the
 * two cannot drift: they used to run different queries — the profile counted
 * `APPROVED AND status = ACTIVE` with no expiry check — so the same provider
 * read "22 of 25 ads" on one tab and "19 active ads" on the next, with no way
 * to reconcile them.
 */
export function countActivePosts(
  repo: Repository<Post>,
  ownerId: string,
  em?: EntityManager,
): Promise<number> {
  return (em ? em.getRepository(Post) : repo)
    .createQueryBuilder('post')
    .where('post.userId = :ownerId', { ownerId })
    .andWhere('post.approval_status != :rejected', { rejected: 'REJECTED' })
    .andWhere('post.status != :expired', { expired: Status.EXPIRED })
    .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())')
    .getCount();
}
