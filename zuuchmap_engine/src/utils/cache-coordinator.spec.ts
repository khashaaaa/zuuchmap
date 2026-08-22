import { EventEmitter } from 'events';

/**
 * The property under test: subscription must be tied to the connection
 * lifecycle. If Redis is briefly down at boot, a one-shot subscribe() fails
 * silently and that worker serves stale caches forever — so the coordinator
 * must (re)subscribe on every 'ready', which ioredis emits on initial connect
 * AND after every reconnect.
 */
const mockClients: Record<string, any> = {};

jest.mock('./redis', () => ({
  redisEnabled: () => true,
  createRedis: (role: string) => mockClients[role],
}));

import { CacheCoordinator } from './cache-coordinator';

function fakeClient() {
  const c: any = new EventEmitter();
  c.subscribe = jest.fn().mockResolvedValue(1);
  c.publish = jest.fn().mockResolvedValue(0);
  c.disconnect = jest.fn();
  return c;
}

describe('CacheCoordinator', () => {
  it('subscribes on every (re)connect so a boot-time Redis outage cannot silently disable invalidation', () => {
    mockClients['cache-pub'] = fakeClient();
    const sub = (mockClients['cache-sub'] = fakeClient());

    const coordinator = new CacheCoordinator();
    coordinator.onModuleInit();

    sub.emit('ready'); // initial connect
    sub.emit('ready'); // reconnect after an outage
    expect(sub.subscribe).toHaveBeenCalledTimes(2);
    expect(sub.subscribe).toHaveBeenCalledWith('zuuchmap:cache:invalidate');

    coordinator.onModuleDestroy();
  });
});
