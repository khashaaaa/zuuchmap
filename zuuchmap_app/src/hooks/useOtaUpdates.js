import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Over-the-air updates.
 *
 * `expo-updates` was not a dependency and `app.json` had no `updates` block, so
 * a JavaScript-only fix — a wrong label, a broken screen, a bad request — meant
 * a full store review. Days on iOS. For a product that is not launched yet,
 * that was the most expensive missing piece of app infrastructure.
 *
 * The fetch never blocks the UI, and the reload never happens under the user:
 * an app that restarts itself mid-form loses whatever was being typed. The
 * caller decides when to apply, and the default moment is a return from
 * background, when nothing is in progress.
 */
export function useOtaUpdates({ applyOnForeground = true } = {}) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Disabled in Expo Go and in dev builds — there is no update channel to
    // check, and asking produces a confusing error rather than nothing.
    if (!Updates.isEnabled || __DEV__) return undefined;

    let cancelled = false;

    const check = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable || cancelled) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew && !cancelled) setPending(true);
      } catch {
        // Offline, or the channel is unreachable. The installed build keeps
        // running; an update check must never be able to break the app.
      }
    };

    check();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // Applying on the way back from background is the one moment nothing is
  // half-typed. `pending` still drives an explicit "restart to update" prompt
  // where a screen would rather ask.
  useEffect(() => {
    if (!pending || !applyOnForeground) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') Updates.reloadAsync().catch(() => { });
    });
    return () => subscription.remove();
  }, [pending, applyOnForeground]);

  return {
    updatePending: pending,
    applyUpdate: () => Updates.reloadAsync().catch(() => { }),
  };
}

export default useOtaUpdates;
