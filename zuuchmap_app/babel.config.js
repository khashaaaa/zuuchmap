/**
 * Metro reads Expo's preset implicitly; Jest does not — it needs a babel
 * config on disk to transform JSX and the RN module graph. Adding it here is
 * what makes the app testable at all, and it changes nothing about the build:
 * this is the same preset Metro was already applying.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
