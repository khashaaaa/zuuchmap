import { AdminService } from './admin.service';

describe('AdminService.getPendingPosts', () => {
  const makeService = (items: unknown[], total: number) => {
    const qb: any = {
      leftJoinAndSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      addSelect: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      limit: jest.fn(() => qb),
      offset: jest.fn(() => qb),
      getManyAndCount: jest.fn(async () => [items, total]),
      getMany: jest.fn(async () => items),
      getCount: jest.fn(async () => total),
    };
    const postRepo = { createQueryBuilder: jest.fn(() => qb) };
    const svc = new AdminService(
      postRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
    );
    return { svc, qb };
  };

  // The client used to infer depth from whether a page came back full, which
  // reported 51 pending when there were 318 — the admin saw two pages of seven.
  it('reports the true queue depth, not the page size', async () => {
    const { svc } = makeService(new Array(50).fill({ id: 1 }), 318);
    const res = await svc.getPendingPosts(undefined, 1, 50);
    expect(res.items).toHaveLength(50);
    expect(res.total).toBe(318);
  });

  it('drains oldest first so the tail cannot starve', async () => {
    const { svc, qb } = makeService([], 0);
    await svc.getPendingPosts();
    // A parked revision is ordered by when it was submitted, a never-approved
    // post by when it was created — one queue, one clock, FIFO across both.
    const [expr, alias] = qb.addSelect.mock.calls[0];
    expect(expr).toContain('pending_revision');
    expect(expr).toContain('post.date_created');
    // Ordered by the alias, never by the expression itself: TypeORM reads a
    // bare `COALESCE((post...` as an entity alias and throws at runtime, which
    // is invisible to a mocked builder — see the int spec for the real query.
    expect(qb.orderBy).toHaveBeenCalledWith(alias, 'ASC');
    expect(qb.orderBy).not.toHaveBeenCalledWith(
      expect.stringContaining('COALESCE'),
      expect.anything(),
    );
  });

  it('clamps page and limit before they reach SQL', async () => {
    const { svc, qb } = makeService([], 0);
    await svc.getPendingPosts(undefined, -3, 9999);
    expect(qb.limit).toHaveBeenCalledWith(200);
    expect(qb.offset).toHaveBeenCalledWith(0);
  });

  it('filters by category only when one is given', async () => {
    const { svc, qb } = makeService([], 0);
    await svc.getPendingPosts('sos');
    expect(qb.andWhere).toHaveBeenCalledWith('post.category = :category', {
      category: 'sos',
    });
  });
});
