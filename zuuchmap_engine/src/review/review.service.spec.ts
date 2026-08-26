import { ReviewService } from './review.service';

describe('ReviewService.upsert — comment lifecycle', () => {
  const makeService = (existing: any) => {
    const reviewRepo = {
      findOne: jest.fn(async () => existing),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
    };
    const userRepo = { findOne: jest.fn(async () => ({ id: 'provider-1' })) };
    const bookings = { hasAcceptedBooking: jest.fn(async () => true) };
    const svc = new ReviewService(reviewRepo as any, userRepo as any, bookings as any, {} as any);
    return { svc, reviewRepo };
  };

  const dto = (over: any = {}) => ({ provider_id: 'provider-1', rating: 1, ...over });

  // The bug this guards: coalescing an absent comment to the stored one left a
  // five-star write-up sitting under a freshly lowered one-star rating.
  it('clears the comment when the author submits an empty one', async () => {
    const { svc, reviewRepo } = makeService({ id: 1, rating: 5, comment: 'Great service!' });
    await svc.upsert('author-1', dto({ comment: '' }) as any);
    expect(reviewRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 1, comment: null }),
    );
  });

  it('keeps the stored comment when the key is omitted', async () => {
    const { svc, reviewRepo } = makeService({ id: 1, rating: 5, comment: 'Great service!' });
    await svc.upsert('author-1', dto() as any);
    expect(reviewRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 1, comment: 'Great service!' }),
    );
  });

  it('replaces the comment when a new one is supplied', async () => {
    const { svc, reviewRepo } = makeService({ id: 1, rating: 5, comment: 'Great service!' });
    await svc.upsert('author-1', dto({ comment: 'Late and rude.' }) as any);
    expect(reviewRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ comment: 'Late and rude.' }),
    );
  });

  it('refuses an author with no accepted booking', async () => {
    const reviewRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const svc = new ReviewService(
      reviewRepo as any,
      { findOne: jest.fn(async () => ({ id: 'provider-1' })) } as any,
      { hasAcceptedBooking: jest.fn(async () => false) } as any,
      {} as any,
    );
    await expect(svc.upsert('author-1', dto() as any)).rejects.toMatchObject({
      response: { code: 'REVIEW_NEEDS_BOOKING' },
    });
    expect(reviewRepo.save).not.toHaveBeenCalled();
  });
});

describe('ReviewService.providerStats', () => {
  // Chainable query-builder stub: `getRawOne` / `getCount` resolve to what the
  // test hands in, everything else returns the builder.
  const qb = (result: any) => {
    const b: any = {};
    for (const m of ['select', 'addSelect', 'where', 'andWhere']) b[m] = jest.fn(() => b);
    b.getRawOne = jest.fn(async () => result);
    b.getCount = jest.fn(async () => result);
    return b;
  };

  const makeService = ({ avgSeconds, completed, user }: any) => {
    const builders = [qb({ avg_seconds: avgSeconds }), qb(completed)];
    const respBuilder = builders[0];
    const bookingRepo = { createQueryBuilder: jest.fn(() => builders.shift()) };
    const userRepo = { findOne: jest.fn(async () => user) };
    const svc = new ReviewService({} as any, userRepo as any, {} as any, bookingRepo as any);
    return { svc, bookingRepo, userRepo, builders, respBuilder };
  };

  const created = new Date('2025-03-01T00:00:00.000Z');

  it('rounds the mean response time to tenths of an hour', async () => {
    const { svc } = makeService({
      avgSeconds: '5400', // 1.5h — Postgres returns numerics as strings
      completed: 3,
      user: { date_created: created, company: { is_verified: true } },
    });
    await expect(svc.providerStats('p1')).resolves.toEqual({
      avg_response_hours: 1.5,
      completed_bookings: 3,
      member_since: '2025-03-01T00:00:00.000Z',
      company_verified: true,
    });
  });

  it('reports null response time when the provider has never responded', async () => {
    const { svc } = makeService({
      avgSeconds: null, // AVG over zero rows
      completed: 0,
      user: { date_created: created, company: null },
    });
    const stats = await svc.providerStats('p1');
    expect(stats.avg_response_hours).toBeNull();
    expect(stats.completed_bookings).toBe(0);
    expect(stats.company_verified).toBe(false);
  });

  it('only counts ACCEPTED/DECLINED bookings for response time', async () => {
    const { svc, userRepo } = makeService({ avgSeconds: '0', completed: 0, user: null });
    const stats = await svc.providerStats('p1');
    expect(stats.avg_response_hours).toBe(0);
    expect(stats.member_since).toBeNull();
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 'p1' }, relations: ['company'] });
  });

  // The stat is only as good as the column it reads. date_updated is bumped by
  // any later write to the row — the nightly review-prompt sweep, above all —
  // so measuring from it reported hundreds of hours for providers who answered
  // in minutes. responded_at is written once, when the provider answers.
  it('measures from responded_at, not from the row\'s last update', async () => {
    const { svc, respBuilder } = makeService({ avgSeconds: '5400', completed: 1, user: null });
    await svc.providerStats('p1');
    const expr = respBuilder.select.mock.calls[0][0];
    expect(expr).toContain('responded_at');
    expect(expr).not.toContain('date_updated');
    expect(respBuilder.andWhere).toHaveBeenCalledWith('b.responded_at IS NOT NULL');
  });
});
