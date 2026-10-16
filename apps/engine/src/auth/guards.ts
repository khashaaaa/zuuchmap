import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { verifyHs256 } from './jwt';
import { authenticate, bearerToken, type AuthedRequest, type RequestUser } from './request-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
    private readonly ds: DataSource,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = await authenticate(req, this.cfg, this.ds);
    if (!user) throw new UnauthorizedException('Invalid or missing token');
    req.user = user;
    return true;
  }
}

/** Never rejects: sets `req.user` when a valid token is present, leaves it unset otherwise. */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
    private readonly ds: DataSource,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    try {
      const user = await authenticate(req, this.cfg, this.ds);
      if (user) req.user = user;
    } catch {
      // A broken lookup must not turn a public route into an error.
    }
    return true;
  }
}

/** Authenticates by itself (no need to stack JwtAuthGuard); 403 unless the phone is in ADMIN_PHONES. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
    private readonly ds: DataSource,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user ?? (await authenticate(req, this.cfg, this.ds));
    if (!user) throw new UnauthorizedException('Invalid or missing token');
    if (!user.is_admin) throw new ForbiddenException('Admins only');
    req.user = user;
    return true;
  }
}

/** The signed-in account (undefined behind OptionalJwtAuthGuard when anonymous). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

/**
 * Rate limits count per account when the request carries a validly signed token, else per
 * address: Mongolian carriers put many phones behind one address (CGNAT). A forged token falls
 * back to the address; the session is checked by the route's own guard, not here.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const token = bearerToken(req as unknown as Request);
    const sub = token ? verifyHs256(token, env().JWT_SECRET)?.sub : undefined;
    return Promise.resolve(sub ? `u:${sub}` : `ip:${String((req as unknown as Request).ip)}`);
  }
}
