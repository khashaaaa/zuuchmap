import { AdminService } from './admin.service';

describe('AdminService.getPendingPosts', () => {
  const makeService = (items: unknown[], total: number) => {
    const qb: any = {
      leftJoinAndSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      take: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      getManyAndCount: jest.fn(async () => [items, total]),
      getMany: jest.fn(async () => items),
      getCount: jest.fn(async () => total),
    };
    const postRepo = { createQueryBuilder: jest.fn(() => qb) };
    const svc = new AdminService(
      postRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any, undefined as any,
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
    expect(qb.orderBy).toHaveBeenCalledWith('post.date_created', 'ASC');
  });

  it('clamps page and limit before they reach SQL', async () => {
    const { svc, qb } = makeService([], 0);
    await svc.getPendingPosts(undefined, -3, 9999);
    expect(qb.take).toHaveBeenCalledWith(200);
    expect(qb.skip).toHaveBeenCalledWith(0);
  });

  it('filters by category only when one is given', async () => {
    const { svc, qb } = makeService([], 0);
    await svc.getPendingPosts('sos');
    expect(qb.andWhere).toHaveBeenCalledWith('post.category = :category', { category: 'sos' });
  });
});
