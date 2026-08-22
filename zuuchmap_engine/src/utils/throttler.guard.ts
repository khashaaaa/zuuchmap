import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest, ThrottlerException } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { jwtSecret } from './jwt-secret';

/**
 * Rate-limit guard, keyed on user id where possible, that fails OPEN.
 *
 * getTracker: a request carrying a *valid* JWT is bucketed per user. Mongolian
 * carriers CGNAT many subscribers behind one IP, so per-IP buckets alone would
 * let one busy cell tower exhaust the shared budget and 429 innocent users.
 * (Only a verified signature counts — a forged token falls through to IP, so
 * tokens can't be used to mint unlimited buckets.)
 *
 * Anonymous requests key on the real client IP: nginx sets `X-Real-IP` to the
 * connecting socket address ($remote_addr) and always overwrites it, so —
 * unlike a client-supplied `X-Forwarded-For` — it cannot be spoofed to mint
 * fresh buckets. Preferring it removes any reliance on Express `trust proxy`
 * arithmetic. Falls back to `req.ip` for local/dev requests without nginx.
 *
 * handleRequest: when the storage backend (Redis) is unreachable, the limiter
 * allows the request instead of 500-ing it. A rate limiter is a protection
 * layer — its outage must degrade to "unlimited", never to a full API outage.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AppThrottlerGuard.name);
  private readonly jwt = new JwtService();

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const auth = req.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify(auth.slice(7), { secret: jwtSecret() });
        if (payload?.sub) return `user:${payload.sub}`;
      } catch {
        // invalid/expired token — treat as anonymous
      }
    }
    const realIp = req.headers?.['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) return realIp;
    return req.ip;
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (err: any) {
      // The client hit the limit — must still 429. (ThrottlerException doesn't
      // set .name, so match by type, not by string.)
      if (err instanceof ThrottlerException) throw err;
      // Anything else is a storage/backend failure → fail open.
      this.logger.warn(`Rate-limit storage error — allowing request (fail open): ${err?.message}`);
      return true;
    }
  }
}
