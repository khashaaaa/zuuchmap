import { splitTargets } from '../post/post-notification.service';

jest.mock('./webPush', () => ({
  webPushConfigured: jest.fn(() => true),
  sendWebPush: jest.fn(),
  WebPushTarget: undefined,
}));

const webPush = require('./webPush');

/**
 * Two transports now share one `push_device` table. The failure this guards
 * against is a row being *counted* as addressed while nothing is delivered —
 * which is invisible, because a push that silently drops looks exactly like a
 * push nobody tapped.
 */
describe('splitTargets', () => {
  beforeEach(() => webPush.webPushConfigured.mockReturnValue(true));

  it('routes each device to the transport it speaks', () => {
    const { expo, web } = splitTargets([
      { token: 'ExponentPushToken[aaa]', provider: 'EXPO' },
      {
        token: 'https://fcm.googleapis.com/x',
        provider: 'WEB',
        web_subscription: { keys: { p256dh: 'p', auth: 'a' } },
      },
    ]);
    expect(expo).toEqual(['ExponentPushToken[aaa]']);
    expect(web).toEqual([
      {
        endpoint: 'https://fcm.googleapis.com/x',
        keys: { p256dh: 'p', auth: 'a' },
      },
    ]);
  });

  // A WEB row whose keys never made it into the column cannot be encrypted to,
  // so it is not a target — counting it would report a delivery that failed.
  it('drops a web row with no keying material', () => {
    const { web } = splitTargets([
      {
        token: 'https://fcm.googleapis.com/x',
        provider: 'WEB',
        web_subscription: null,
      },
      {
        token: 'https://fcm.googleapis.com/y',
        provider: 'WEB',
        web_subscription: { keys: { p256dh: 'p' } },
      },
    ]);
    expect(web).toHaveLength(0);
  });

  it('drops every web row when VAPID is not configured', () => {
    webPush.webPushConfigured.mockReturnValue(false);
    const { web, expo } = splitTargets([
      {
        token: 'https://fcm.googleapis.com/x',
        provider: 'WEB',
        web_subscription: { keys: { p256dh: 'p', auth: 'a' } },
      },
      { token: 'ExponentPushToken[bbb]', provider: 'EXPO' },
    ]);
    expect(web).toHaveLength(0);
    // The other transport is unaffected — each is independently absent.
    expect(expo).toEqual(['ExponentPushToken[bbb]']);
  });

  it('ignores a non-Expo token on an EXPO row', () => {
    const { expo } = splitTargets([
      { token: 'some-old-fcm-token', provider: 'EXPO' },
      { token: '', provider: 'EXPO' },
    ]);
    expect(expo).toHaveLength(0);
  });

  // Rows written before the provider column existed default to EXPO, so an
  // absent provider must behave exactly like an explicit one.
  it('treats a row with no provider as Expo', () => {
    const { expo } = splitTargets([{ token: 'ExponentPushToken[ccc]' }]);
    expect(expo).toEqual(['ExponentPushToken[ccc]']);
  });
});
