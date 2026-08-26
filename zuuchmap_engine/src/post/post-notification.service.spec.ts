import { PostNotificationService } from './post-notification.service';
import { SOCKET_EVENTS } from '../events/events.gateway';

/**
 * The fan-out is the part of push that fails silently: every caller swallows
 * its errors on purpose, so a broken dispatch looks exactly like a quiet day.
 * These tests pin the three things nothing else can observe — who gets
 * addressed, that dead tokens are pruned, and that the reported count is the
 * number Expo accepted rather than the number we hoped for.
 */
describe('PostNotificationService.dispatch', () => {
  const expoResponse = (statuses: Array<'ok' | 'error'>) => ({
    ok: true,
    json: async () => ({
      data: statuses.map((s) =>
        s === 'ok'
          ? { status: 'ok', id: 'ticket' }
          : {
              status: 'error',
              message: 'gone',
              details: { error: 'DeviceNotRegistered' },
            },
      ),
    }),
  });

  const make = (devices: Array<{ id: string; token: string }>) => {
    const pushDeviceRepo = {
      find: jest.fn(async () => devices),
      delete: jest.fn(async (_criteria: any) => ({ affected: 1 })),
    };
    const userRepo = {
      find: jest.fn(async () => [{ id: 'admin-1' }]),
      createQueryBuilder: jest.fn(),
    };
    const svc = new PostNotificationService(
      userRepo as any,
      pushDeviceRepo as any,
    );
    return { svc, pushDeviceRepo, userRepo };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('addresses every device the recipients own, in one batched request', async () => {
    const fetchMock = jest.fn(
      async () => expoResponse(['ok', 'ok', 'ok']) as any,
    );
    global.fetch = fetchMock as any;
    const { svc } = make([
      { id: 'd1', token: 'ExponentPushToken[a]' },
      { id: 'd2', token: 'ExponentPushToken[b]' }, // same user, second device
      { id: 'd3', token: 'ExponentPushToken[c]' },
    ]);

    await svc.notifyUsers(['u1', 'u2'], 'title', 'body', { postId: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(sent).toHaveLength(3);
    expect(sent.map((m: any) => m.to)).toEqual([
      'ExponentPushToken[a]',
      'ExponentPushToken[b]',
      'ExponentPushToken[c]',
    ]);
    expect(sent[0].data).toEqual({ postId: 5 });
  });

  it('deletes the tokens Expo reports as unregistered', async () => {
    global.fetch = jest.fn(
      async () => expoResponse(['ok', 'error']) as any,
    ) as any;
    const { svc, pushDeviceRepo } = make([
      { id: 'd1', token: 'ExponentPushToken[live]' },
      { id: 'd2', token: 'ExponentPushToken[dead]' },
    ]);

    await svc.notifyUsers(['u1'], 't', 'b');

    expect(pushDeviceRepo.delete).toHaveBeenCalledTimes(1);
    const [arg] = pushDeviceRepo.delete.mock.calls[0] as any[];
    expect(arg.token._value ?? arg.token.value).toEqual([
      'ExponentPushToken[dead]',
    ]);
  });

  it('reports what Expo accepted, not what was attempted, when a batch fails', async () => {
    // An HTTP failure yields no ticket and no dead token. Counting
    // targets-minus-dead called that a delivery.
    global.fetch = jest.fn(
      async () => ({ ok: false, status: 502 }) as any,
    ) as any;
    const { svc } = make([
      { id: 'd1', token: 'ExponentPushToken[a]' },
      { id: 'd2', token: 'ExponentPushToken[b]' },
    ]);

    const userRepoQb = {
      select: () => userRepoQb,
      where: () => userRepoQb,
      andWhere: () => userRepoQb,
      getMany: async () => [{ id: 'u1' }],
    };
    (svc as any).userRepository.createQueryBuilder = () => userRepoQb;

    await expect(svc.broadcast('t', 'b')).resolves.toEqual({ sent: 0 });
  });

  it('never calls Expo when the recipients have no devices', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const { svc } = make([]);
    await svc.notifyUsers(['u1'], 't', 'b');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips tokens that are not Expo tokens rather than posting them', async () => {
    const fetchMock = jest.fn(async () => expoResponse(['ok']) as any);
    global.fetch = fetchMock as any;
    const { svc } = make([
      { id: 'd1', token: 'fcm-legacy-token' },
      { id: 'd2', token: 'ExponentPushToken[ok]' },
    ]);

    await svc.notifyUsers(['u1'], 't', 'b');

    const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(sent.map((m: any) => m.to)).toEqual(['ExponentPushToken[ok]']);
  });

  it('carries the booking event name the app routes on', async () => {
    const fetchMock = jest.fn(async () => expoResponse(['ok']) as any);
    global.fetch = fetchMock as any;
    const { svc } = make([{ id: 'd1', token: 'ExponentPushToken[a]' }]);

    // The app decides received-vs-own bookings from this exact value; an
    // underscore spelling here is what made every provider land on the
    // customer tab.
    await svc.notifyUsers(['u1'], 't', 'b', {
      bookingId: 9,
      notifType: SOCKET_EVENTS.BOOKING_REQUESTED,
    });

    const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(sent[0].data.notifType).toBe('booking.requested');
  });

  describe('notifyEach — one request, many payloads', () => {
    const makeWithUsers = (
      devices: Array<{ id: string; token: string; user: { id: string } }>,
    ) => {
      const pushDeviceRepo = {
        find: jest.fn(async () => devices),
        delete: jest.fn(async (_c: any) => ({ affected: 1 })),
      };
      const svc = new PostNotificationService(
        { find: jest.fn() } as any,
        pushDeviceRepo as any,
      );
      return { svc, pushDeviceRepo };
    };

    it('sends every recipient its own payload in a single call', async () => {
      const fetchMock = jest.fn(
        async () => expoResponse(['ok', 'ok', 'ok']) as any,
      );
      global.fetch = fetchMock as any;
      const { svc } = makeWithUsers([
        { id: 'd1', token: 'ExponentPushToken[c1]', user: { id: 'c1' } },
        { id: 'd2', token: 'ExponentPushToken[c1b]', user: { id: 'c1' } }, // second device
        { id: 'd3', token: 'ExponentPushToken[c2]', user: { id: 'c2' } },
      ]);

      await svc.notifyEach([
        { userId: 'c1', title: 'a', body: 'b', data: { bookingId: 1 } },
        { userId: 'c2', title: 'a', body: 'b', data: { bookingId: 2 } },
      ]);

      // The whole point: one HTTPS round-trip for the sweep, not one per person.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
      expect(sent).toHaveLength(3);
      expect(
        sent.filter((m: any) => m.data.bookingId === 1).map((m: any) => m.to),
      ).toEqual(['ExponentPushToken[c1]', 'ExponentPushToken[c1b]']);
      expect(
        sent.find((m: any) => m.to === 'ExponentPushToken[c2]').data,
      ).toEqual({ bookingId: 2 });
    });

    it('prunes dead tokens from the batch like the single-payload path does', async () => {
      global.fetch = jest.fn(async () => expoResponse(['error']) as any) as any;
      const { svc, pushDeviceRepo } = makeWithUsers([
        { id: 'd1', token: 'ExponentPushToken[dead]', user: { id: 'c1' } },
      ]);
      await svc.notifyEach([{ userId: 'c1', title: 'a', body: 'b' }]);
      expect(pushDeviceRepo.delete).toHaveBeenCalledTimes(1);
    });

    it('never calls Expo when nobody in the batch has a device', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as any;
      const { svc } = makeWithUsers([]);
      await expect(
        svc.notifyEach([{ userId: 'c1', title: 'a', body: 'b' }]),
      ).resolves.toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('swallows a transport failure so the caller is never rolled back', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as any;
    const { svc } = make([{ id: 'd1', token: 'ExponentPushToken[a]' }]);
    await expect(svc.notifyUsers(['u1'], 't', 'b')).resolves.toBeUndefined();
  });
});
