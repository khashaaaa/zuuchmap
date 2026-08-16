import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAuthGuard but does NOT throw when the token is absent or invalid.
 * `req.user` is populated when a valid Bearer token is present; otherwise it
 * remains undefined, letting the handler decide how to proceed.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // Override so Passport doesn't throw — we just let the request through
  // regardless of whether authentication succeeded.
  handleRequest(_err: any, user: any) {
    return user ?? null;
  }
}
