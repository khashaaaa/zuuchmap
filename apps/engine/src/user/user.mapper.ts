import type { User as ApiUser, UserType } from '@zuuchmap/core';
import { isAdminPhone, type AuthConfig } from '../auth/auth.config';
import type { User } from './entities/user.entity';

export function toApiUser(u: User, cfg: Pick<AuthConfig, 'adminPhones'>): ApiUser {
  return {
    id: u.id,
    type: u.type as UserType,
    phone_number: u.phone_number,
    parent_name: u.parent_name,
    given_name: u.given_name,
    email: u.email,
    profile_picture: u.profile_picture,
    is_verified: u.is_verified,
    address: u.address,
    plan: u.plan as ApiUser['plan'],
    plan_expires_at: u.plan_expires_at ? u.plan_expires_at.toISOString() : null,
    posts_rejected: u.posts_rejected,
    date_created: u.date_created.toISOString(),
    date_updated: u.date_updated.toISOString(),
    is_admin: isAdminPhone(cfg, u.phone_number),
  };
}
