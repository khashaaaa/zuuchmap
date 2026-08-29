import * as Haptics from 'expo-haptics';

// A tap of confirmation on a completed action. Not gated by reduce-motion:
// that setting is about movement, and haptics are not movement (same rule as
// LikeButton). Swallows the native-module-absent case (web, Expo Go).
export const successHaptic = () => {
    try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
        // no haptics module
    }
};
