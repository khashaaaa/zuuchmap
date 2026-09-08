import { BadRequestException } from '@nestjs/common';
import { LikedpostService } from './likedpost.service';

/**
 * Saving a listing.
 *
 * Small surface, but it carries two rules worth pinning: a provider cannot
 * inflate their own listing's save count, and a double-tap must not turn into
 * an error the user sees. Both were untested.
 */
const make = (over: any = {}) => {
  const likedPostRepository = {
    findOne: jest.fn(async () => over.existing ?? null),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => ({ id: 'like-1', ...x })),
    delete: jest.fn(async () => ({ affected: over.affected ?? 1 })),
    count: jest.fn(async () => over.count ?? 0),
    ...over.likedPostRepository,
  };
  const userRepository = {
    findOne: jest.fn(async () => ('user' in over ? over.user : { id: 'user-1' })),
  };
  const postRepository = {
    findOne: jest.fn(async () => over.post ?? { id: 7, user: { id: 'someone-else' } }),
  };
  const svc = new LikedpostService(
    likedPostRepository as any,
    userRepository as any,
    postRepository as any,
  );
  return { svc, likedPostRepository };
};

describe('LikedpostService.likePost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves a listing for a user who does not own it', async () => {
    const { svc } = make();
    await expect(svc.likePost('user-1', 'vehiclerent', 7)).resolves.toMatchObject({ success: true });
  });

  it('refuses to let an owner save their own listing', async () => {
    // Otherwise a provider can run their own save count up, and the count is a
    // signal customers read as popularity.
    const { svc } = make({ post: { id: 7, user: { id: 'user-1' } } });
    await expect(svc.likePost('user-1', 'vehiclerent', 7)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown user', async () => {
    const { svc } = make({ user: null });
    await expect(svc.likePost('ghost', 'vehiclerent', 7)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats an already-saved listing as a no-op, not a failure', async () => {
    const { svc, likedPostRepository } = make({ existing: { id: 'like-1' } });
    const result = await svc.likePost('user-1', 'vehiclerent', 7);
    expect(result.success).toBe(false);
    expect(likedPostRepository.save).not.toHaveBeenCalled();
  });

  it('swallows the unique-violation a double-tap races into', async () => {
    // Two taps in flight both pass the findOne check; the second one loses at
    // the index. 23505 is "already saved", which is what the user wanted anyway
    // — surfacing it as a 500 would be a lie about the outcome.
    const { svc, likedPostRepository } = make();
    likedPostRepository.save.mockRejectedValueOnce({ code: '23505' });
    await expect(svc.likePost('user-1', 'vehiclerent', 7)).resolves.toMatchObject({ success: false });
  });

  it('still propagates a database error that is not a duplicate', async () => {
    const { svc, likedPostRepository } = make();
    likedPostRepository.save.mockRejectedValueOnce({ code: '08006', message: 'connection failure' });
    await expect(svc.likePost('user-1', 'vehiclerent', 7)).rejects.toMatchObject({ code: '08006' });
  });
});

describe('LikedpostService.unlikePost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports whether a row was actually removed', async () => {
    await expect(make({ affected: 1 }).svc.unlikePost('user-1', 'vehiclerent', 7))
      .resolves.toMatchObject({ success: true });
    await expect(make({ affected: 0 }).svc.unlikePost('user-1', 'vehiclerent', 7))
      .resolves.toMatchObject({ success: false });
  });

  it('scopes the delete to the caller, never to the listing alone', async () => {
    const { svc, likedPostRepository } = make();
    await svc.unlikePost('user-1', 'vehiclerent', 7);
    // Dropping user_id here would clear everyone's save of that listing.
    expect(likedPostRepository.delete).toHaveBeenCalledWith({
      user_id: 'user-1', post_type: 'vehiclerent', post_id: 7,
    });
  });
});

describe('LikedpostService.checkPostLiked', () => {
  it('answers with a boolean, not the row', async () => {
    await expect(make({ existing: { id: 'like-1' } }).svc.checkPostLiked('user-1', 'vehiclerent', 7)).resolves.toBe(true);
    await expect(make({ existing: null }).svc.checkPostLiked('user-1', 'vehiclerent', 7)).resolves.toBe(false);
  });
});
