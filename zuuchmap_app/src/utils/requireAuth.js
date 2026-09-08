import { useCallback, useEffect, useState } from 'react';
import { getAuthToken, onAuthChanged } from '../services/api/authHelpers';
import { showErrorModal, hideErrorModal } from './errorManager';
import i18n from '../i18n';

/**
 * Guest mode.
 *
 * The app used to route every unauthenticated launch to the phone screen, so
 * nothing could be seen without an account — and an account costs the USER 150₮,
 * because verify.mn bills them for the SMS that proves possession of the number.
 * We were charging people to find out whether the marketplace had anything they
 * wanted. The web has always let anyone browse; this closes that gap.
 *
 * The rule: reading is open, writing needs an account. Browse, map, listing
 * detail and the public contact number are free. The four actions that write to
 * a user account — saving, messaging, reporting, booking — prompt instead.
 *
 * `getAuthToken` and not `userService.isAuthenticated()` on purpose: the latter
 * round-trips to /user/profile, which is far too slow to sit between a tap and
 * its response. A token that exists but has expired is not this module's
 * problem — apiClient's 401 interceptor already tears that session down.
 */

/** True when there is no session at all. */
export const isGuest = async () => !(await getAuthToken());

/**
 * Gate one action behind a session.
 *
 * Returns true when the caller may proceed. Otherwise shows a modal naming the
 * action and offering the login screen, and returns false — so a call site is
 * always `if (!(await ensureAuth(...))) return;`.
 *
 * `reasonKey` names WHY the account is needed. A generic "sign in to continue"
 * on a heart icon reads as a wall; "sign in to save listings" reads as an
 * explanation, and the difference is whether the tap felt like a mistake.
 */
export const ensureAuth = async (navigation, reasonKey = 'auth.loginRequired') => {
  if (await getAuthToken()) return true;

  showErrorModal(
    i18n.t('auth.guestTitle'),
    i18n.t(reasonKey),
    [
      { text: i18n.t('common.cancel') },
      {
        text: i18n.t('auth.title'),
        onPress: () => {
          hideErrorModal();
          navigation.navigate('PhoneNumber');
        },
      },
    ],
    'info',
  );
  return false;
};

/**
 * Whether the viewer is browsing without an account.
 *
 * `null` until the first read of AsyncStorage resolves — a screen must render
 * neither the member view nor the guest view during that tick, or the guest
 * banner flashes on every cold start for an account that is perfectly signed in.
 *
 * Rides the existing login/logout signal rather than polling, so returning from
 * the phone screen updates every mounted consumer at once.
 */
export const useIsGuest = () => {
  const [guest, setGuest] = useState(null);

  const read = useCallback(() => {
    let cancelled = false;
    getAuthToken()
      .then((token) => { if (!cancelled) setGuest(!token); })
      .catch(() => { if (!cancelled) setGuest(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cancel = read();
    const unsubscribe = onAuthChanged(read);
    return () => { cancel(); unsubscribe(); };
  }, [read]);

  return guest;
};
