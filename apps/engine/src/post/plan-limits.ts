import { Plan } from '@zuuchmap/core';
import { env } from '../config/env';

export interface PlanLimits { posts: number; expiryDays: number | null }

/** What each plan entitles a provider to (`expiryDays: null` = the category's/default window). */
export function planLimits(plan: string): PlanLimits {
  const e = env();
  return plan === Plan.PROVIDER
    ? { posts: e.POST_QUOTA_PROVIDER, expiryDays: e.POST_PROVIDER_EXPIRY_DAYS }
    : { posts: e.POST_QUOTA_FREE, expiryDays: null };
}

/** A paid plan that lapsed is FREE until renewed; derived on read so a missed job never grants it. */
export function effectivePlan(user: { plan: string; plan_expires_at: Date | null } | null | undefined, now = Date.now()): Plan {
  if (!user || user.plan === Plan.FREE) return Plan.FREE;
  if (user.plan_expires_at && user.plan_expires_at.getTime() <= now) return Plan.FREE;
  return user.plan === Plan.PROVIDER ? Plan.PROVIDER : Plan.FREE;
}

/** The plan may lengthen the default window but never override a category's own shorter one (SOS). */
export function expiryDaysFor(category: { post_expiry_days: number | null } | null | undefined, plan: string): number {
  const own = category?.post_expiry_days;
  if (own) return own;
  const base = env().POST_EXPIRY_DAYS;
  return Math.max(base, planLimits(plan).expiryDays ?? 0);
}
