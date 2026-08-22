import { PostService } from './post.service';
import { sharedCache } from '../utils/cache';

describe('PostService.create expiry from category schema', () => {
  const makeService = (schema: Record<string, unknown>) => {
    const postRepo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
    };
    const categoryService = { getCategory: jest.fn().mockResolvedValue({ active: true, subcategories: [], ...schema }) };
    const notifications = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };
    const svc = new PostService(
      postRepo as any, {} as any, {} as any, categoryService as any, notifications as any, undefined as any,
    );
    return { svc, postRepo };
  };
  const dto: any = { category: 'sos', title: 't', details: 'd' };
  const days = (date: Date) => Math.round((date.getTime() - Date.now()) / 86_400_000);

  beforeEach(() => sharedCache.invalidatePrefix(''));

  it("uses the category's post_expiry_days when set", async () => {
    const { svc } = makeService({ post_expiry_days: 7 });
    const saved = await svc.create(dto, [], undefined as any);
    expect(days(saved.expires_at)).toBe(7);
  });

  it('falls back to 30 days when the category has no override', async () => {
    const { svc } = makeService({ post_expiry_days: null });
    const saved = await svc.create(dto, [], undefined as any);
    expect(days(saved.expires_at)).toBe(30);
  });

  // Regression: the owner must come from the authenticated caller (the third
  // argument), never from a `user` field a client can put in the body — that
  // let any signed-in user plant a post on another account.
  it('binds the owner from the ownerId argument, ignoring any body user field', async () => {
    const postRepo = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => x) };
    const owner = { id: 'caller-uuid' };
    const userRepo = { findOne: jest.fn().mockResolvedValue(owner) };
    const categoryService = { getCategory: jest.fn().mockResolvedValue({ active: true, subcategories: [], post_expiry_days: 30 }) };
    const notifications = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };
    const svc = new PostService(
      postRepo as any, userRepo as any, {} as any, categoryService as any, notifications as any, undefined as any,
    );

    const spoofed: any = { category: 'sos', title: 't', details: 'd', user: 'victim-uuid' };
    const saved = await svc.create(spoofed, [], owner.id);

    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 'caller-uuid' } });
    expect(saved.user).toBe(owner);
  });
});

describe('PostService.findAll sorting and price range', () => {
  let service: PostService;
  let qb: any;

  beforeEach(() => {
    sharedCache.invalidatePrefix('');
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const postRepo = { createQueryBuilder: jest.fn(() => qb) };
    service = new PostService(
      postRepo as any, {} as any, {} as any, {} as any, {} as any, undefined as any,
    );
  });

  it('defaults to newest-first', async () => {
    await service.findAll({});
    expect(qb.orderBy).toHaveBeenCalledWith('post.date_created', 'DESC');
  });

  it('sorts by price ascending with nulls last, newest as tiebreaker', async () => {
    await service.findAll({ sort: 'price_asc' });
    expect(qb.orderBy).toHaveBeenCalledWith('post.price_amount', 'ASC', 'NULLS LAST');
    expect(qb.addOrderBy).toHaveBeenCalledWith('post.date_created', 'DESC');
  });

  it('sorts by price descending with nulls last', async () => {
    await service.findAll({ sort: 'price_desc' });
    expect(qb.orderBy).toHaveBeenCalledWith('post.price_amount', 'DESC', 'NULLS LAST');
  });

  it('sorts by views descending', async () => {
    await service.findAll({ sort: 'views' });
    expect(qb.orderBy).toHaveBeenCalledWith('post.views', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('post.date_created', 'DESC');
  });

  it('falls back to newest for an unknown sort value', async () => {
    await service.findAll({ sort: 'evil; DROP TABLE post' });
    expect(qb.orderBy).toHaveBeenCalledWith('post.date_created', 'DESC');
  });

  it('applies price_min and price_max as numeric bounds', async () => {
    await service.findAll({ price_min: '50000', price_max: '200000' });
    expect(qb.andWhere).toHaveBeenCalledWith('post.price_amount >= :priceMin', { priceMin: 50000 });
    expect(qb.andWhere).toHaveBeenCalledWith('post.price_amount <= :priceMax', { priceMax: 200000 });
  });

  it('ignores non-numeric price bounds', async () => {
    await service.findAll({ price_min: 'abc' });
    const priceCalls = qb.andWhere.mock.calls.filter(([sql]: [string]) => sql.includes('price_amount'));
    expect(priceCalls).toHaveLength(0);
  });

  it('survives a duplicated q param (array) without throwing', async () => {
    await expect(service.findAll({ q: ['hello', 'world'] as any })).resolves.toBeDefined();
    expect(qb.getManyAndCount).toHaveBeenCalled();
  });

  it('clamps a negative page to the first page', async () => {
    await service.findAll({ page: -3 });
    expect(qb.skip).toHaveBeenCalledWith(0);
  });

  it('clamps a non-numeric page to the first page', async () => {
    await service.findAll({ page: NaN });
    expect(qb.skip).toHaveBeenCalledWith(0);
  });

  it('clamps a negative limit up to 1', async () => {
    await service.findAll({ limit: -5 });
    expect(qb.take).toHaveBeenCalledWith(1);
  });

  it('caps an oversized limit at 100', async () => {
    await service.findAll({ limit: 999999 });
    expect(qb.take).toHaveBeenCalledWith(100);
  });

  it('clamps page and limit in findByUser too', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const svc = new PostService(
      { find } as any, {} as any, {} as any, {} as any, {} as any, undefined as any,
    );
    await svc.findByUser('u1', -1, 99999);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ take: 100, skip: 0 }));
  });

  it('keeps cache entries distinct per sort and price range', async () => {
    await service.findAll({ sort: 'price_asc' });
    await service.findAll({ sort: 'price_desc' });
    // If the cache key ignored sort, the second call would be served from cache
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(2);
  });
});
