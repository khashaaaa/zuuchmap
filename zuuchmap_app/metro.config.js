const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native-maps has no web implementation — swap in a placeholder shim
// so web bundles don't crash on the map screens.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.startsWith('react-native-maps')) {
    return {
      filePath: require.resolve('./src/shims/react-native-maps.web.js'),
      type: 'sourceFile',
    };
  }
  return (upstreamResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
