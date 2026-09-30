import { SimpleCache } from './cache';

/**
 * How long a session lasts.
 *
 * A signed-in user stays signed in until they sign out. Thirty days meant an
 * account that went quiet over a slow winter came back to a login screen, and
 * signing in again is not free here — verify.mn bills the *user* 150₮ for the
 * SMS that proves the number. Charging somebody to return to an app they never
 * left is a good way to make sure they do not.
 *
 * Still bounded rather than infinite: a token that never expires is one that
 * can never be aged out if it leaks.
 */
export const SESSION_EXPIRES_IN = '365d';

/**
 * Who a token belongs to, remembered briefly.
 *
 * `JwtStrategy.validate` runs before every guarded handler — and before every
 * optionally-guarded one that arrives with a token, which includes the public
 * browse. It read the user joined to their company each time, so a browse page
 * served straight from cache still cost a signed-in visitor a database round
 * trip, to learn a phone number that cannot change.
 *
 * What is cached is identity only: handlers read `id` and `phone_number` from
 * `req.user` and nothing else. Anything that can change — plan, company,
 * profile — is read from the database by the service that needs it, so there
 * is nothing here to go stale except the account's existence. Deleting an
 * account calls `forgetSessionUser`; on another pm2 instance the token outlives
 * the row by at most this TTL.
 */
export const SESSION_USER_TTL_MS = 30_000;
export const sessionUsers = new SimpleCache(5000);

export function forgetSessionUser(userId: string): void {
  sessionUsers.del(userId);
}
