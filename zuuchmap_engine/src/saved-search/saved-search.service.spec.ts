import { matchesSavedSearch, SavedSearchService, NOTIFY_COOLDOWN_MS } from './saved-search.service';

const post = {
  id: 7,
  title: 'Howo 25 tonn self-dumper',
  category: 'vehiclerent',
  subcategory: 'dump_truck',
  province: 'UB',
  district: 'BZD',
  attributes: { capacity: 25, brand: 'Howo', year: '2019' },
  user: { id: 'owner' },
};

describe('matchesSavedSearch', () => {
  it('matches when no constraint is set', () => {
    expect(matchesSavedSearch(post, {})).toBe(true);
    expect(matchesSavedSearch(post, { category: null, q: '', attrs: null })).toBe(true);
  });

  it('requires equality on category/subcategory/province/district when set', () => {
    expect(matchesSavedSearch(post, { category: 'vehiclerent', district: 'BZD' })).toBe(true);
    expect(matchesSavedSearch(post, { category: 'toolrent' })).toBe(false);
    expect(matchesSavedSearch(post, { subcategory: 'crane' })).toBe(false);
    expect(matchesSavedSearch(post, { province: 'UB', district: 'SBD' })).toBe(false);
  });

  it('q is a case-insensitive substring of the title', () => {
    expect(matchesSavedSearch(post, { q: 'howo' })).toBe(true);
    expect(matchesSavedSearch(post, { q: '  DUMPER ' })).toBe(true);
    expect(matchesSavedSearch(post, { q: 'crane' })).toBe(false);
    expect(matchesSavedSearch({ ...post, title: null }, { q: 'x' })).toBe(false);
  });

  it('attrs: equality, with or without the attr. prefix, compared as strings', () => {
    expect(matchesSavedSearch(post, { attrs: { 'attr.brand': 'Howo' } })).toBe(true);
    expect(matchesSavedSearch(post, { attrs: { brand: 'Howo' } })).toBe(true);
    expect(matchesSavedSearch(post, { attrs: { 'attr.year': 2019 } })).toBe(true);
    expect(matchesSavedSearch(post, { attrs: { 'attr.brand': 'Shacman' } })).toBe(false);
    expect(matchesSavedSearch(post, { attrs: { 'attr.missing': 'x' } })).toBe(false);
    expect(matchesSavedSearch(post, { attrs: { 'attr.brand': '' } })).toBe(true);
  });

  it('attrs: _min/_max are numeric bounds', () => {
    expect(matchesSavedSearch(post, { attrs: { 'attr.capacity_min': '20' } })).toBe(true);
    expect(matchesSavedSearch(post, { attrs: { 'attr.capacity_min': 30 } })).toBe(false);
    expect(matchesSavedSearch(post, { attrs: { 'attr.capacity_max': 25 } })).toBe(true);
    expect(matchesSavedSearch(post, { attrs: { 'attr.capacity_max': 24 } })).toBe(false);
    expect(matchesSavedSearch(post, { attrs: { 'attr.brand_min': 1 } })).toBe(false);
    expect(matchesSavedSearch({ ...post, attributes: null }, { attrs: { 'attr.capacity_min': 1 } })).toBe(false);
  });
});

describe('SavedSearchService.notifyForApprovedPost', () => {
  const makeService = (rows: any[]) => {
    const qb = { where: jest.fn().mockReturnThis(), getMany: jest.fn(async () => rows) };
    const repo = { createQueryBuilder: jest.fn(() => qb), update: jest.fn(async (..._a: any[]) => ({})) };
    const notifications = { notifyUsers: jest.fn(async (..._a: any[]) => undefined) };
    const svc = new SavedSearchService(repo as any, notifications as any);
    return { svc, repo, notifications };
  };

  it('pushes once per user, skips the owner and recently-notified searches, stamps last_notified_at', async () => {
    const recent = new Date(Date.now() - NOTIFY_COOLDOWN_MS / 2);
    const stale = new Date(Date.now() - NOTIFY_COOLDOWN_MS * 2);
    const rows = [
      { id: 'a', user_id: 'u1', category: 'vehiclerent', attrs: {}, last_notified_at: null },
      { id: 'b', user_id: 'u1', category: null, q: 'howo', attrs: {}, last_notified_at: stale },
      { id: 'c', user_id: 'u2', category: 'vehiclerent', attrs: {}, last_notified_at: recent },
      { id: 'd', user_id: 'owner', category: 'vehiclerent', attrs: {}, last_notified_at: null },
      { id: 'e', user_id: 'u3', category: 'vehiclerent', district: 'SBD', attrs: {}, last_notified_at: null },
    ];
    const { svc, repo, notifications } = makeService(rows);
    await svc.notifyForApprovedPost(post);

    expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
    const [userIds, , , data] = notifications.notifyUsers.mock.calls[0];
    expect(userIds).toEqual(['u1']);
    expect(data).toEqual({ type: 'saved_search', postId: 7, category: 'vehiclerent' });
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect((repo.update.mock.calls[0][0] as any).id._value).toEqual(['a', 'b']);
  });

  it('is silent when nothing matches', async () => {
    const { svc, repo, notifications } = makeService([
      { id: 'x', user_id: 'u9', category: 'toolrent', attrs: {}, last_notified_at: null },
    ]);
    await svc.notifyForApprovedPost(post);
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('swallows repository errors so approval is not affected', async () => {
    const { svc, repo } = makeService([]);
    repo.createQueryBuilder.mockImplementation(() => { throw new Error('db down'); });
    await expect(svc.notifyForApprovedPost(post)).resolves.toBeUndefined();
  });
});
