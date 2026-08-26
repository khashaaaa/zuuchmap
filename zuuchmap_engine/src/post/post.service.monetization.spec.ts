import { PostService } from './post.service';
import { sharedCache } from '../utils/cache';
import { addMonths } from '../admin/admin.service';

/**
 * `assertQuota` counts through a query builder rather than `count()` so it can
 * apply the same `expires_at > NOW()` guard the browse query uses — a post the
 * cron has not swept yet is already invisible and must not hold a slot.
 */
const quotaQb = (activeCount: number) => ({
  createQueryBuilder: jest.fn(() => {
    const qb: any = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getCount: jest.fn(async () => activeCount),
    };
    return qb;
  }),
});

describe('PostService post quota', () => {
  const makeService = (plan: string, activeCount: number) => {
    const postRepo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
      ...quotaQb(activeCount),
    };
    const userRepo = { findOne: jest.fn(async () => ({ id: 'owner-1', plan })) };
    const categoryService = {
      getCategory: jest.fn().mockResolvedValue({ active: true, subcategories: [], post_expiry_days: null }),
    };
    const notifications = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };
    const svc = new PostService(
      postRepo as any, userRepo as any, {} as any, categoryService as any, notifications as any, undefined as any,
    );
    return { svc, postRepo };
  };
  const dto: any = { category: 'sos', title: 't', details: 'd' };

  beforeEach(() => sharedCache.invalidatePrefix(''));

  it('allows a FREE provider their third post', async () => {
    const { svc } = makeService('FREE', 2);
    await expect(svc.create(dto, [], 'owner-1')).resolves.toBeDefined();
  });

  it('rejects a FREE provider’s fourth post', async () => {
    const { svc } = makeService('FREE', 3);
    await expect(svc.create(dto, [], 'owner-1')).rejects.toThrow('POST_QUOTA_EXCEEDED');
  });

  it('allows a PROVIDER past the FREE ceiling', async () => {
    const { svc } = makeService('PROVIDER', 10);
    await expect(svc.create(dto, [], 'owner-1')).resolves.toBeDefined();
  });

  it('rejects a PROVIDER at 25', async () => {
    const { svc } = makeService('PROVIDER', 25);
    await expect(svc.create(dto, [], 'owner-1')).rejects.toThrow('POST_QUOTA_EXCEEDED');
  });

  // The sweep cron only runs at midnight, so between expiry and the sweep a post
  // is gone from browse while `status` still says ACTIVE. Quota has to agree
  // with visibility or a provider cannot replace a post they can no longer see.
  it('measures quota on expires_at, not just on status', async () => {
    const { svc, postRepo } = makeService('FREE', 0);
    await svc.create(dto, [], 'owner-1');
    const qb = (postRepo.createQueryBuilder as jest.Mock).mock.results[0].value;
    const clauses = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(clauses).toContain('(post.expires_at IS NULL OR post.expires_at > NOW())');
  });

  // A lapsed subscription must not keep paid entitlement alive.
  it('treats an expired PROVIDER plan as FREE', async () => {
    const postRepo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
      ...quotaQb(3),
    };
    const past = new Date(Date.now() - 86_400_000);
    const userRepo = { findOne: jest.fn(async () => ({ id: 'owner-1', plan: 'PROVIDER', plan_expires_at: past })) };
    const categoryService = {
      getCategory: jest.fn().mockResolvedValue({ active: true, subcategories: [], post_expiry_days: null }),
    };
    const svc = new PostService(
      postRepo as any, userRepo as any, {} as any, categoryService as any,
      { notifyAdmins: jest.fn().mockResolvedValue(undefined) } as any, undefined as any,
    );
    await expect(svc.create(dto, [], 'owner-1')).rejects.toThrow('POST_QUOTA_EXCEEDED');
  });
});

describe('PostService plan-based expiry', () => {
  const makeService = (plan: string, categoryExpiryDays: number | null) => {
    const postRepo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
      ...quotaQb(0),
    };
    const userRepo = { findOne: jest.fn(async () => ({ id: 'owner-1', plan })) };
    const categoryService = {
      getCategory: jest.fn().mockResolvedValue({
        active: true, subcategories: [], post_expiry_days: categoryExpiryDays,
      }),
    };
    const svc = new PostService(
      postRepo as any, userRepo as any, {} as any, categoryService as any,
      { notifyAdmins: jest.fn().mockResolvedValue(undefined) } as any, undefined as any,
    );
    return { svc };
  };
  const dto: any = { category: 'sos', title: 't', details: 'd' };
  const days = (date: Date) => Math.round((date.getTime() - Date.now()) / 86_400_000);

  beforeEach(() => sharedCache.invalidatePrefix(''));

  it('gives a PROVIDER 90 days', async () => {
    const { svc } = makeService('PROVIDER', null);
    const saved = await svc.create(dto, [], 'owner-1');
    expect(days(saved.expires_at)).toBe(90);
  });

  it('leaves FREE on the category default', async () => {
    const { svc } = makeService('FREE', null);
    const saved = await svc.create(dto, [], 'owner-1');
    expect(days(saved.expires_at)).toBe(30);
  });

  it('leaves FREE on an explicit category override', async () => {
    const { svc } = makeService('FREE', 7);
    const saved = await svc.create(dto, [], 'owner-1');
    expect(days(saved.expires_at)).toBe(7);
  });

  // A category that deliberately expires fast (SOS at 7 days) must not be
  // stretched to 90 just because the poster pays — the short window is the
  // product behaviour, not a limitation being sold around.
  it('does not let a plan override a shorter category window', async () => {
    const { svc } = makeService('PROVIDER', 7);
    const saved = await svc.create(dto, [], 'owner-1');
    expect(days(saved.expires_at)).toBe(7);
  });
});

describe('PostService featured ordering', () => {
  const makeQb = () => {
    const calls: any[] = [];
    const qb: any = {
      calls,
      leftJoinAndSelect: () => qb,
      addSelect: (...a: any[]) => { calls.push(['addSelect', ...a]); return qb; },
      orderBy: (...a: any[]) => { calls.push(['orderBy', ...a]); return qb; },
      addOrderBy: (...a: any[]) => { calls.push(['addOrderBy', ...a]); return qb; },
      andWhere: () => qb,
      skip: () => qb,
      take: () => qb,
      getMany: async () => [],
      getCount: async () => 0,
    };
    return qb;
  };
  const makeService = (qb: any) => new PostService(
    { createQueryBuilder: () => qb } as any, {} as any, {} as any,
    { getCategory: jest.fn() } as any, { notifyAdmins: jest.fn().mockResolvedValue(undefined) } as any, undefined as any,
  );

  beforeEach(() => sharedCache.invalidatePrefix(''));

  it('ranks live featured windows first on the default sort', async () => {
    const qb = makeQb();
    await makeService(qb).findAll({ approval_status: 'APPROVED' });
    expect(qb.calls).toContainEqual(['orderBy', 'post.is_featured', 'DESC']);
    expect(qb.calls).toContainEqual(['addOrderBy', 'post.date_created', 'DESC']);
  });

  // The ordering has to stay on a stored column. Ordering by the predicate
  // `featured_until > NOW()` cannot be indexed, and turned the browse into a
  // full scan-and-sort of every matching row to return one page.
  it('never sorts on a NOW()-dependent expression', async () => {
    const qb = makeQb();
    await makeService(qb).findAll({ approval_status: 'APPROVED' });
    const sortCalls = JSON.stringify(qb.calls.filter((c: any[]) => /order|Select/i.test(c[0])));
    expect(sortCalls).not.toContain('NOW()');
    expect(sortCalls).not.toContain('featured_rank');
  });

  // An explicit price sort is a direct user instruction. Paid placement must
  // not silently reorder it, or "cheapest first" stops being true.
  it('does not apply featured ranking to an explicit price sort', async () => {
    const qb = makeQb();
    await makeService(qb).findAll({ approval_status: 'APPROVED', sort: 'price_asc' });
    expect(JSON.stringify(qb.calls)).not.toContain('is_featured');
  });
});

describe('addMonths', () => {
  // Bare setMonth() rolls a day the target month lacks into the next one,
  // which silently hands the buyer extra days.
  it('clamps to the last day of a shorter month', () => {
    expect(addMonths(new Date(2026, 0, 31), 1).toDateString()).toBe(new Date(2026, 1, 28).toDateString());
    expect(addMonths(new Date(2024, 0, 31), 1).toDateString()).toBe(new Date(2024, 1, 29).toDateString());
    expect(addMonths(new Date(2026, 2, 31), 1).toDateString()).toBe(new Date(2026, 3, 30).toDateString());
  });

  it('leaves a day every target month has alone', () => {
    expect(addMonths(new Date(2026, 0, 15), 3).toDateString()).toBe(new Date(2026, 3, 15).toDateString());
    expect(addMonths(new Date(2026, 11, 15), 1).toDateString()).toBe(new Date(2027, 0, 15).toDateString());
  });
});

describe('PostService.relistIfLapsed', () => {
  const makeService = (post: any, plan = 'FREE', categoryExpiryDays: number | null = null) => {
    const postRepo = { createQueryBuilder: jest.fn() };
    const userRepo = { findOne: jest.fn(async () => ({ id: 'owner-1', plan })) };
    const categoryService = {
      getCategory: jest.fn().mockResolvedValue({
        active: true, subcategories: [], post_expiry_days: categoryExpiryDays,
      }),
    };
    const svc = new PostService(
      postRepo as any, userRepo as any, {} as any, categoryService as any,
      { notifyAdmins: jest.fn().mockResolvedValue(undefined) } as any, undefined as any,
    );
    return { svc, post };
  };
  const daysFromNow = (d: Date) => Math.round((d.getTime() - Date.now()) / 86_400_000);

  it('leaves a post whose window is still open alone', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000);
    const { svc, post } = makeService({ id: 1, category: 'sos', expires_at: future, user: { id: 'owner-1' } });
    await expect(svc.relistIfLapsed(post)).resolves.toBe(false);
    expect(post.expires_at).toBe(future);
  });

  // Approving an already-lapsed post used to publish something `findAll` could
  // never return: the provider saw "approved" and the post stayed invisible.
  it('reopens the window on a lapsed post using the category default', async () => {
    const { svc, post } = makeService({
      id: 1, category: 'sos', expires_at: new Date(Date.now() - 86_400_000), user: { id: 'owner-1' },
    });
    await expect(svc.relistIfLapsed(post)).resolves.toBe(true);
    expect(daysFromNow(post.expires_at)).toBe(30);
  });

  it('gives a paid plan its longer window on relist', async () => {
    const { svc, post } = makeService(
      { id: 1, category: 'sos', expires_at: new Date(Date.now() - 86_400_000), user: { id: 'owner-1' } },
      'PROVIDER',
    );
    await svc.relistIfLapsed(post);
    expect(daysFromNow(post.expires_at)).toBe(90);
  });

  it('respects a category that has chosen a shorter window', async () => {
    const { svc, post } = makeService(
      { id: 1, category: 'sos', expires_at: new Date(Date.now() - 86_400_000), user: { id: 'owner-1' } },
      'PROVIDER', 7,
    );
    await svc.relistIfLapsed(post);
    expect(daysFromNow(post.expires_at)).toBe(7);
  });

  // A fresh window is useless while the sweep's EXPIRED stamp still filters it.
  it('clears an EXPIRED status alongside the new window', async () => {
    const { svc, post } = makeService({
      id: 1, category: 'sos', status: 'EXPIRED',
      expires_at: new Date(Date.now() - 86_400_000), user: { id: 'owner-1' },
    });
    await svc.relistIfLapsed(post);
    expect(post.status).toBe('ACTIVE');
  });
});

describe('PostService.providerStats — plan block', () => {
  const makeService = (owner: any, activeCount: number) => {
    const postRepo = {
      manager: { query: jest.fn(async () => []) },
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          where: jest.fn(() => qb), andWhere: jest.fn(() => qb),
          getCount: jest.fn(async () => activeCount),
        };
        return qb;
      }),
    };
    const userRepo = { findOne: jest.fn(async () => owner) };
    return new PostService(
      postRepo as any, userRepo as any, {} as any, {} as any,
      { notifyAdmins: jest.fn() } as any, undefined as any,
    );
  };

  it('reports the FREE ceiling and the live post count', async () => {
    const svc = makeService({ id: 'owner-1', plan: 'FREE' }, 2);
    const { plan } = await svc.providerStats('owner-1');
    expect(plan).toEqual({ name: 'FREE', expires_at: null, post_limit: 3, posts_active: 2 });
  });

  it('reports the paid ceiling and the expiry date', async () => {
    const expires = new Date(Date.now() + 30 * 86_400_000);
    const svc = makeService({ id: 'owner-1', plan: 'PROVIDER', plan_expires_at: expires }, 7);
    const { plan } = await svc.providerStats('owner-1');
    expect(plan).toEqual({ name: 'PROVIDER', expires_at: expires, post_limit: 25, posts_active: 7 });
  });

  // Entitlement is derived on read, so a lapsed plan must read as FREE here too
  // — and carry no expiry date, which beside the word "Free" would read as if
  // the plan were still running.
  it('reports a lapsed plan as FREE with no expiry', async () => {
    const svc = makeService(
      { id: 'owner-1', plan: 'PROVIDER', plan_expires_at: new Date(Date.now() - 86_400_000) }, 7,
    );
    const { plan } = await svc.providerStats('owner-1');
    expect(plan).toEqual({ name: 'FREE', expires_at: null, post_limit: 3, posts_active: 7 });
  });

  // The number shown must be the number the create path measures against.
  it('counts quota through the same predicate as the create path', async () => {
    const svc = makeService({ id: 'owner-1', plan: 'FREE' }, 1);
    await svc.providerStats('owner-1');
    const qb = ((svc as any).postRepository.createQueryBuilder as jest.Mock).mock.results[0].value;
    const clauses = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(clauses).toContain('(post.expires_at IS NULL OR post.expires_at > NOW())');
  });
});
