// The preset Metro applies implicitly, stated — it is also where a future
// babel plugin would go.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
