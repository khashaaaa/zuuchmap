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
