import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import i18n from '../i18n';
import { API_CONFIG } from '../config/api.config';
import { showInfoModal, hideErrorModal } from './errorManager';
import { registerPushToken } from '../hooks/useNotificationSync';
import { logger } from './logger';

const ASKED_KEY = API_CONFIG.STORAGE_KEYS.PUSH_ASKED;

/**
 * Asking for notifications at a moment that explains itself.
 *
 * The OS dialog used to fire the instant a user finished verifying their phone,
 * with nothing on screen to suggest why they would want it. Most people say no
 * to that, and on iOS the "no" is permanent short of a trip into Settings — at
 * which point the account is unreachable. That is not a small thing here:
 * there is no SMS transport, signup is phone-based so most accounts have no
 * email, and the email fallback only fires for someone with no device at all.
 * A provider who declined once simply never heard that their listing had been
 * approved or that a customer had written to them, and the customer's message
 * went into a void.
 *
 * So we ask when the answer is obvious: right after posting a listing that is
 * now waiting on an admin, after writing to someone who has to write back,
 * after sending a booking request. `reasonKey` names which of those it is.
 *
 * Two gates in front of the OS dialog: an in-app explanation the user can
 * decline for free (declining ours costs nothing — the real prompt is never
 * spent), and a flag so we only ever spend the real one once.
 */
export async function maybeAskForPush(reasonKey) {
  if (!Device.isDevice) return false;
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;
    // Already refused at the OS level, or already offered by us. Nagging is
    // what makes people turn a system off, not what makes them turn it on.
    if (!canAskAgain) return false;
    if (await AsyncStorage.getItem(ASKED_KEY)) return false;
  } catch (err) {
    logger.warn?.('Push permission check failed:', err?.message);
    return false;
  }

  return new Promise((resolve) => {
    showInfoModal(
      i18n.t('push.promptTitle'),
      i18n.t(reasonKey),
      [
        {
          text: i18n.t('push.promptLater'),
          onPress: async () => {
            // Remembered, so the offer is made once. The OS prompt is untouched
            // and still available from the profile screen whenever they want it.
            await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
            resolve(false);
          },
        },
        {
          text: i18n.t('push.promptEnable'),
          onPress: async () => {
            hideErrorModal();
            await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
            try {
              const { status } = await Notifications.requestPermissionsAsync();
              if (status === 'granted') await registerPushToken();
              resolve(status === 'granted');
            } catch (err) {
              logger.warn?.('Push permission request failed:', err?.message);
              resolve(false);
            }
          },
        },
      ],
    );
  });
}

/** Whether this device will actually receive a push right now. */
export async function hasPushPermission() {
  if (!Device.isDevice) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Turn notifications on from a settings row, where the user asked for it.
 *
 * Unlike `maybeAskForPush` this ignores the once-only flag — they came looking.
 * Returns false when the OS will no longer show its dialog, which is the case
 * the caller has to answer with "open Settings" rather than another try.
 */
export async function enablePush() {
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      await registerPushToken();
      return true;
    }
    return false;
  } catch (err) {
    logger.warn?.('Push permission request failed:', err?.message);
    return false;
  }
}
