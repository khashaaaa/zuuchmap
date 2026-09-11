import { Repository } from 'typeorm';
import { Post } from './entities/post.entity';
import { invalidatePostReadCaches } from '../utils/cache';

/** The longest placement window that can be opened in one go. */
export const MAX_FEATURED_DAYS = 90;

/**
 * Opens (or extends) the paid placement window on one post.
 *
 * There are two ways a window gets opened — an admin granting one, and a
 * settled QPay invoice — and they have to agree on what "seven more days"
 * means, in the same way and for the same reason that `PlanService.setPlan` is
 * the single writer of plan entitlement. Two copies of the extend-from-
 * whichever-is-later rule would eventually disagree about something the
 * provider paid for.
 *
 * `days` of 0 clears the window, which is how an admin revokes one.
 */
export async function openFeaturedWindow(
  posts: Repository<Post>,
  postId: number,
  days: number,
): Promise<{ featured_until: Date | null }> {
  const clamped = Math.min(Math.max(Math.floor(days) || 0, 0), MAX_FEATURED_DAYS);
  const post = await posts.findOne({ where: { id: postId } });
  if (!post) return { featured_until: null };

  if (clamped === 0) {
    post.featured_until = null;
  } else {
    // Extend from whichever is later, so buying a second window before the
    // first lapses never burns the days already paid for.
    const base =
      post.featured_until && new Date(post.featured_until) > new Date()
        ? new Date(post.featured_until)
        : new Date();
    base.setDate(base.getDate() + clamped);
    post.featured_until = base;
  }

  // Kept in step with the window it mirrors. The hourly sweep only has to catch
  // windows that *lapse*; every deliberate change lands here first, so a
  // placement someone just bought is never an hour late appearing.
  post.is_featured =
    !!post.featured_until && new Date(post.featured_until) > new Date();

  await posts.save(post);
  invalidatePostReadCaches();
  return { featured_until: post.featured_until };
}
