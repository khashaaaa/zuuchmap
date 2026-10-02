import { ForbiddenException } from '@nestjs/common';
import { isAdmin } from '../admin/admin.guard';

export enum UserType {
  PROVIDER = 'PROVIDER',
  CUSTOMER = 'CUSTOMER',
}

/**
 * Provider-only actions check the account, not the client. The clients only
 * hide these from customers, and a customer token could create posts, a
 * company and a plan invoice straight against the API. Admins pass: the web
 * admin creates posts through the same endpoint.
 */
export function assertProvider(
  user: { type?: string; phone_number?: string } | null,
): void {
  if (user?.type === UserType.PROVIDER) return;
  if (user?.phone_number && isAdmin(user.phone_number)) return;
  throw new ForbiddenException({
    message: 'Only provider accounts can do this.',
    code: 'PROVIDER_ONLY',
  });
}
