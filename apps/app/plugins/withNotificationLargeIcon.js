// Android notifications carry the app icon as their large icon (right-hand thumbnail), next to
// the white status-bar glyph from the expo-notifications plugin. expo-notifications reads it from
// this manifest meta-data and exposes no plugin option for it.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const KEY = 'expo.modules.notifications.large_notification_icon';

module.exports = function withNotificationLargeIcon(config) {
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, KEY, '@mipmap/ic_launcher', 'resource');
    return c;
  });
};
