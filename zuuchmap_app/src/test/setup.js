/**
 * Jest setup for the app.
 *
 * Everything mocked here is a native module: in a Node test environment they
 * have no implementation to call into, so an unmocked import throws before the
 * unit under test runs. Nothing here changes behaviour on a device.
 */
// RNTL v14 ships its matchers in the main entry — there is no separate
// extend-expect module to import.
import '@testing-library/react-native';

// React 19 requires this flag before it will run updates inside act(). RNTL
// normally sets it, but not early enough for a renderer that mounts effects on
// the first pass — without it every state update during mount warns and the
// tree never commits.
global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-crypto', () => ({
  randomUUID: () => '0123456789abcdef0123456789abcdef',
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-updates', () => ({
  isEnabled: false,
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(async () => ({ isNew: false })),
  reloadAsync: jest.fn(async () => undefined),
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((cb) => cb({ setContext: jest.fn(), setLevel: jest.fn() })),
  wrap: (component) => component,
}));

// Icons are font glyphs with no behaviour to assert, and pulling the real set
// in drags expo-font (and its asset loader) into a Node environment that has no
// font system to load into. A named stand-in keeps the tree renderable and the
// accessibility labels — which are what a test actually looks for — intact.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, ...props }) => React.createElement(Text, props, name ?? 'icon');
  return { Ionicons: Icon, MaterialIcons: Icon, MaterialCommunityIcons: Icon, FontAwesome: Icon, Feather: Icon };
});

// Silences the "not implemented" noise RN's animation helpers emit under Jest,
// which otherwise buries a real failure in a wall of warnings.
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), { virtual: true });
