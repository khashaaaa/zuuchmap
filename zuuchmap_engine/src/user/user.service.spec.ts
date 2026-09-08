import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';

jest.mock('../utils/uploader', () => ({
  deleteSingleImage: jest.fn(async () => undefined),
}));
import { deleteSingleImage } from '../utils/uploader';

/**
 * The account service — untested until now, though it owns the push-device
 * table that decides whose phone rings.
 */
const make = (over: any = {}) => {
  const userRepository = {
    findOne: jest.fn(async () => over.user ?? null),
    find: jest.fn(async () => over.users ?? []),
    save: jest.fn(async (u: any) => u),
    remove: jest.fn(async () => undefined),
    delete: jest.fn(async () => ({ affected: 1 })),
    ...over.userRepository,
  };
  // `activePosts` runs through countActivePosts(), which is a query builder —
  // the same one the quota is enforced with.
  const activeCount = jest.fn(async () => 0);
  const postRepository = {
    find: jest.fn(async () => over.posts ?? []),
    count: jest.fn(async () => 0),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: activeCount,
    })),
    ...over.postRepository,
  };
  const pushDeviceRepository = {
    upsert: jest.fn(async () => undefined),
    delete: jest.fn(async () => ({ affected: 1 })),
    ...over.pushDeviceRepository,
  };
  const svc = new UserService(
    userRepository as any,
    postRepository as any,
    pushDeviceRepository as any,
  );
  return { svc, userRepository, postRepository, pushDeviceRepository, activeCount };
};

describe('UserService — push devices', () => {
  beforeEach(() => jest.clearAllMocks());

  it('binds a device on the token, so a phone that changed hands moves accounts', () => {
    const { svc, pushDeviceRepository } = make();
    return svc.savePushToken('user-1', 'ExponentPushToken[abc]', 'ios').then(() => {
      const [row, options] = pushDeviceRepository.upsert.mock.calls[0];
      expect(row.token).toBe('ExponentPushToken[abc]');
      // Conflict on the token and not on (user, token): otherwise the previous
      // owner keeps a live row and can push to someone else's phone.
      expect(options.conflictPaths).toEqual(['token']);
    });
  });

  it('unbinds only the device that logged out', async () => {
    const { svc, pushDeviceRepository } = make();
    await svc.removePushToken('user-1', 'ExponentPushToken[abc]');

    // The single-column version cleared every device for the account, which
    // muted phones that were still signed in elsewhere.
    expect(pushDeviceRepository.delete).toHaveBeenCalledWith({
      user: { id: 'user-1' },
      token: 'ExponentPushToken[abc]',
    });
  });

  it('clears the whole account when the client cannot say which device it is', async () => {
    const { svc, pushDeviceRepository } = make();
    await svc.removePushToken('user-1');

    // An older build sends no token. Clearing everything is the safe reading:
    // a muted phone is recoverable, a push to a stranger is not.
    expect(pushDeviceRepository.delete).toHaveBeenCalledWith({ user: { id: 'user-1' } });
  });

  it('stores a browser subscription in the same table, tagged WEB', async () => {
    const { svc, pushDeviceRepository } = make();
    await svc.saveWebPushSubscription('user-1', 'https://fcm.example/xyz', {
      p256dh: 'key', auth: 'secret',
    });

    const [row, options] = pushDeviceRepository.upsert.mock.calls[0];
    expect(row.provider).toBe('WEB');
    // The endpoint IS the token — one table and one fan-out regardless of the
    // transport a recipient happens to have.
    expect(row.token).toBe('https://fcm.example/xyz');
    expect(row.web_subscription).toEqual({ keys: { p256dh: 'key', auth: 'secret' } });
    expect(options.conflictPaths).toEqual(['token']);
  });
});

describe('UserService — lookups and updates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('raises NotFound rather than returning null for a missing account', async () => {
    const { svc } = make({ user: null });
    await expect(svc.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update('nope', {} as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.setUserType('99119911', 'PROVIDER')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes the previous avatar when a new one replaces it', async () => {
    const { svc } = make({ user: { id: 'u1', profile_picture: 'old.jpg' } });
    await svc.update('u1', {} as any, 'new.jpg');

    // Without this, every avatar change leaked a paid R2 object forever.
    expect(deleteSingleImage).toHaveBeenCalledWith('old.jpg');
  });

  it('does not delete anything when the update carries no new avatar', async () => {
    const { svc } = make({ user: { id: 'u1', profile_picture: 'old.jpg' } });
    await svc.update('u1', { given_name: 'Bat' } as any);
    expect(deleteSingleImage).not.toHaveBeenCalled();
  });

  it('caps the admin list rather than loading every account', async () => {
    const { svc, userRepository } = make({ users: [] });
    await svc.findAll();
    expect(userRepository.find.mock.calls[0][0].take).toBe(500);
  });

  it('counts posts with COUNT, not by measuring a loaded array', async () => {
    const { svc, postRepository, activeCount } = make();
    postRepository.count.mockResolvedValueOnce(340); // total
    activeCount.mockResolvedValueOnce(12);           // active
    postRepository.find.mockResolvedValueOnce([{ id: 1 }]);

    const result = await svc.getUserPosts('u1');

    // The returned page is capped at 200, so a total taken from `posts.length`
    // would silently stop climbing at 200 for a prolific provider.
    expect(result.totalPosts).toBe(340);
    expect(result.activePosts).toBe(12);
    expect(postRepository.find.mock.calls[0][0].take).toBe(200);
  });
});
