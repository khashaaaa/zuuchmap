import { PostService, expandBusyDates, snapshotOf } from './post.service';
import { sharedCache } from '../utils/cache';

const makeQb = (items: unknown[] = []) => {
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    setParameters: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn(async () => items),
  };
  return qb;
};

describe('PostService.findSimilar', () => {
  const anchor = {
    id: 7,
    category: 'vehiclerent',
    district: 'BZD',
    province: 'UB',
    price_amount: '150000',
    user: null,
  };

  const makeService = (items: unknown[] = []) => {
    const qb = makeQb(items);
    const postRepo = {
      findOne: jest.fn(async () => anchor),
      createQueryBuilder: jest.fn(() => qb),
      manager: {
        query: jest.fn(async (..._args: any[]): Promise<any[]> => []),
      },
    };
    const categoryService = {
      getCategories: jest.fn(async () => [
        { key: 'vehiclerent', has_rental_status: true },
      ]),
    };
    const svc = new PostService(
      postRepo as any,
      {} as any,
      {} as any,
      categoryService as any,
      {} as any,
      undefined as any,
    );
    return { svc, qb, postRepo };
  };

  beforeEach(() => sharedCache.invalidatePrefix(''));

  it('ranks same district, then same province, then price distance, then newest', async () => {
    const { svc, qb } = makeService();
    await svc.findSimilar(7);
    expect(qb.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('post.district = :district'),
      'loc_rank',
    );
    expect(qb.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('ABS(post.price_amount'),
      'price_dist',
    );
    expect(qb.orderBy).toHaveBeenCalledWith('loc_rank', 'ASC');
    expect(qb.addOrderBy.mock.calls).toEqual([
      ['price_dist', 'ASC', 'NULLS LAST'],
      ['post.date_created', 'DESC'],
    ]);
    expect(qb.setParameters).toHaveBeenCalledWith({
      district: 'BZD',
      province: 'UB',
      price: 150000,
    });
  });

  it('stays in the category, excludes the anchor and only returns live posts', async () => {
    const { svc, qb } = makeService();
    await svc.findSimilar(7);
    expect(qb.where).toHaveBeenCalledWith('post.category = :category', {
      category: 'vehiclerent',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('post.id != :id', { id: 7 });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'post.approval_status = :approved',
      { approved: 'APPROVED' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('post.status = :active', {
      active: 'ACTIVE',
    });
  });

  it('clamps the limit and caches for repeat calls', async () => {
    const { svc, qb, postRepo } = makeService();
    await svc.findSimilar(7, 999);
    expect(qb.take).toHaveBeenCalledWith(20);
    await svc.findSimilar(7, 999);
    expect(postRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('attaches busy_dates to rental results', async () => {
    const { svc, postRepo } = makeService([
      { id: 8, category: 'vehiclerent', user: null },
    ]);
    const today = new Date();
    postRepo.manager.query.mockResolvedValueOnce([
      { postId: 8, start_date: today, end_date: today },
    ]);
    const [item] = await svc.findSimilar(7);
    expect(item.busy_dates).toEqual([today.toISOString().slice(0, 10)]);
  });
});

describe('expandBusyDates', () => {
  const today = new Date('2026-08-24T10:00:00Z');

  it('expands a range into days and clips to the 14-day window', () => {
    const out = expandBusyDates(
      [
        {
          postId: 1,
          start_date: '2026-08-20T00:00:00Z',
          end_date: '2026-09-30T00:00:00Z',
        },
      ],
      today,
    );
    const days = out.get(1)!;
    expect(days[0]).toBe('2026-08-24');
    expect(days[days.length - 1]).toBe('2026-09-06');
    expect(days).toHaveLength(14);
  });

  it('merges overlapping bookings per post and keeps posts apart', () => {
    const out = expandBusyDates(
      [
        { postId: 1, start_date: '2026-08-25', end_date: '2026-08-26' },
        { postId: 1, start_date: '2026-08-26', end_date: '2026-08-27' },
        { postId: 2, start_date: '2026-08-30', end_date: '2026-08-30' },
      ],
      today,
    );
    expect(out.get(1)).toEqual(['2026-08-25', '2026-08-26', '2026-08-27']);
    expect(out.get(2)).toEqual(['2026-08-30']);
  });

  it('drops bookings entirely outside the window', () => {
    const out = expandBusyDates(
      [{ postId: 1, start_date: '2026-10-01', end_date: '2026-10-05' }],
      today,
    );
    expect(out.has(1)).toBe(false);
  });
});

describe('PostService.attachBusyDates', () => {
  const makeService = (schemas: unknown[], rows: unknown[] = []) => {
    const query = jest.fn(async (..._args: any[]): Promise<any[]> => rows);
    const svc = new PostService(
      { manager: { query } } as any,
      {} as any,
      {} as any,
      { getCategories: jest.fn(async () => schemas) } as any,
      {} as any,
      undefined as any,
    );
    return { svc, query };
  };

  it('only queries for posts in has_rental_status categories, and leaves others untouched', async () => {
    const { svc, query } = makeService([
      { key: 'vehiclerent', has_rental_status: true },
      { key: 'jobvacancy', has_rental_status: false },
    ]);
    const posts: any[] = [
      { id: 1, category: 'vehiclerent' },
      { id: 2, category: 'jobvacancy' },
    ];
    await svc.attachBusyDates(posts);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1][0]).toEqual([1]);
    expect(posts[0].busy_dates).toEqual([]);
    expect(posts[1].busy_dates).toBeUndefined();
  });

  it('skips the query entirely when nothing on the page is bookable', async () => {
    const { svc, query } = makeService([
      { key: 'jobvacancy', has_rental_status: false },
    ]);
    await svc.attachBusyDates([{ id: 2, category: 'jobvacancy' }]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('PostService.update — previous_snapshot for re-approval', () => {
  const makePost = (over: Record<string, unknown> = {}) => ({
    id: 1,
    category: 'vehiclerent',
    user: { id: 'owner' },
    title: 'Old title',
    details: 'd',
    price_amount: '100',
    price_unit: 'day',
    attributes: { a: 1 },
    images: ['x.jpg'],
    subcategory: 'truck',
    province: 'UB',
    district: 'BZD',
    approval_status: 'APPROVED',
    previous_snapshot: null,
    rejection_field: 'title',
    ...over,
  });
  const makeService = (post: any) => {
    const postRepo = {
      findOne: jest.fn(async () => post),
      save: jest.fn(async (x: any) => x),
    };
    const svc = new PostService(
      postRepo as any,
      {} as any,
      {} as any,
      { getCategories: jest.fn(async () => []) } as any,
      {} as any,
      undefined as any,
    );
    return { svc, postRepo };
  };

  it('snapshots the approved version and clears the rejection field on a content edit', async () => {
    const post = makePost();
    const { svc } = makeService(post);
    const updated = await svc.update(1, { title: 'New title' }, [], 'owner');
    expect(updated.approval_status).toBe('PENDING');
    expect(updated.previous_snapshot).toEqual({
      title: 'Old title',
      details: 'd',
      price: 100,
      price_unit: 'day',
      attributes: { a: 1 },
      images: ['x.jpg'],
      subcategory: 'truck',
      province: 'UB',
      district: 'BZD',
    });
    expect(updated.rejection_field).toBeNull();
    expect(updated.title).toBe('New title');
  });

  it('keeps the first snapshot across a second edit before re-approval', async () => {
    const first = { title: 'Original' };
    const post = makePost({
      approval_status: 'PENDING',
      previous_snapshot: first,
      title: 'Draft 1',
    });
    const { svc } = makeService(post);
    const updated = await svc.update(1, { title: 'Draft 2' }, [], 'owner');
    expect(updated.previous_snapshot).toBe(first);
  });

  it('does not snapshot a post that was never approved', async () => {
    const post = makePost({ approval_status: 'REJECTED' });
    const { svc } = makeService(post);
    const updated = await svc.update(1, { title: 'Fixed' }, [], 'owner');
    expect(updated.previous_snapshot).toBeNull();
    expect(updated.approval_status).toBe('PENDING');
  });

  it('leaves an operational-only edit approved and unsnapshotted', async () => {
    const post = makePost();
    const { svc } = makeService(post);
    const updated = await svc.update(1, { status: 'RENTED' }, [], 'owner');
    expect(updated.approval_status).toBe('APPROVED');
    expect(updated.previous_snapshot).toBeNull();
  });

  it('snapshotOf coerces the decimal price to a number', () => {
    expect(snapshotOf(makePost({ price_amount: '99.50' }) as any).price).toBe(
      99.5,
    );
    expect(
      snapshotOf(makePost({ price_amount: null }) as any).price,
    ).toBeNull();
  });
});
