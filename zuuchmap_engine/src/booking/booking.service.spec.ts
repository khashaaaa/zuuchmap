import { BookingService } from './booking.service';
import { BookingStatus } from '../enums/bookingstatus';
import { Status } from '../enums/status';

/**
 * Availability is not approval. A post can be APPROVED and still be something
 * nobody will answer a request about — the provider's own RENTED toggle, or a
 * listing already past its window.
 */
describe('BookingService — post availability', () => {
  const makeService = (postOverrides: Record<string, unknown>) => {
    const post = {
      id: 1,
      category: 'vehiclerent',
      title: 'Truck',
      approval_status: 'APPROVED',
      status: Status.ACTIVE,
      expires_at: null,
      user: { id: 'provider-1' },
      ...postOverrides,
    };
    const bookingRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((x: any) => ({ id: 10, ...x })),
      save: jest.fn(async (x: any) => x),
      count: jest.fn(async () => 0),
    };
    const postRepo = { findOne: jest.fn(async () => post) };
    const notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
    const categoryService = {
      getCategory: jest.fn().mockResolvedValue({ has_rental_status: true, label: 'Vehicle' }),
    };
    const svc = new BookingService(
      bookingRepo as any, postRepo as any, notifications as any, categoryService as any, undefined as any,
    );
    return { svc, bookingRepo };
  };

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const dto: any = { post_id: 1, start_date: tomorrow, end_date: tomorrow };

  it('accepts a request on an active, unexpired post', async () => {
    const { svc, bookingRepo } = makeService({});
    await expect(svc.create('customer-1', dto)).resolves.toBeDefined();
    expect(bookingRepo.save).toHaveBeenCalled();
  });

  // The provider flipped the post to RENTED: it is spoken for right now.
  it('refuses a request on a RENTED post', async () => {
    const { svc, bookingRepo } = makeService({ status: Status.RENTED });
    await expect(svc.create('customer-1', dto)).rejects.toMatchObject({
      response: { code: 'BOOKING_POST_UNAVAILABLE' },
    });
    expect(bookingRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a request on a post the sweep has marked EXPIRED', async () => {
    const { svc } = makeService({ status: Status.EXPIRED });
    await expect(svc.create('customer-1', dto)).rejects.toMatchObject({
      response: { code: 'BOOKING_POST_UNAVAILABLE' },
    });
  });

  // The nightly sweep runs at midnight, so a post can be past its window while
  // `status` still reads ACTIVE. Browse already hides it; booking must agree.
  it('refuses a request on a post past expires_at but still marked ACTIVE', async () => {
    const { svc, bookingRepo } = makeService({
      status: Status.ACTIVE,
      expires_at: new Date(Date.now() - 3_600_000),
    });
    await expect(svc.create('customer-1', dto)).rejects.toMatchObject({
      response: { code: 'BOOKING_POST_UNAVAILABLE' },
    });
    expect(bookingRepo.save).not.toHaveBeenCalled();
  });

  it('still refuses an unapproved post', async () => {
    const { svc } = makeService({ approval_status: 'PENDING' });
    await expect(svc.create('customer-1', dto)).rejects.toMatchObject({
      response: { code: 'BOOKING_POST_UNAVAILABLE' },
    });
  });
});

describe('BookingService.hasAcceptedBooking', () => {
  // Review eligibility reads booking rows, not posts. Since a deleted post now
  // leaves its bookings behind with a null postId, the customer keeps the right
  // to review a provider who deletes the listing afterwards.
  it('counts accepted bookings by customer and provider alone', async () => {
    const bookingRepo = { count: jest.fn(async () => 1) };
    const svc = new BookingService(
      bookingRepo as any, {} as any, {} as any, {} as any, undefined as any,
    );

    await expect(svc.hasAcceptedBooking('customer-1', 'provider-1')).resolves.toBe(true);
    expect(bookingRepo.count).toHaveBeenCalledWith({
      where: {
        customer: { id: 'customer-1' },
        provider: { id: 'provider-1' },
        status: BookingStatus.ACCEPTED,
      },
    });
  });
});

describe('BookingService.respond — accepting stale requests', () => {
  const makeService = (booking: any) => {
    const bookingRepo = {
      findOne: jest.fn(async () => booking),
      save: jest.fn(async (x: any) => x),
      createQueryBuilder: jest.fn(() => {
        const qb: any = { where: jest.fn(() => qb), andWhere: jest.fn(() => qb), getOne: jest.fn(async () => null) };
        return qb;
      }),
    };
    const svc = new BookingService(
      bookingRepo as any, {} as any,
      { notifyUsers: jest.fn().mockResolvedValue(undefined) } as any, {} as any, undefined as any,
    );
    return { svc, bookingRepo };
  };
  const base = (days: number) => ({
    id: 1,
    status: BookingStatus.PENDING,
    provider: { id: 'provider-1' },
    customer: { id: 'customer-1' },
    post: { id: 1, title: 'Truck' },
    start_date: new Date(Date.now() + (days - 2) * 86_400_000),
    end_date: new Date(Date.now() + days * 86_400_000),
  });

  it('accepts a request whose window is still ahead', async () => {
    const { svc, bookingRepo } = makeService(base(5));
    await expect(svc.respond(1, 'provider-1', true)).resolves.toBeDefined();
    expect(bookingRepo.save).toHaveBeenCalled();
  });

  // A request can sit PENDING until its whole window has gone by. Accepting then
  // mints a live commitment nobody can honour — one that counts toward review
  // eligibility and blocks the post from being deleted.
  it('refuses to accept a request whose dates have already passed', async () => {
    const { svc, bookingRepo } = makeService(base(-3));
    await expect(svc.respond(1, 'provider-1', true)).rejects.toMatchObject({
      response: { code: 'BOOKING_DATE_PAST' },
    });
    expect(bookingRepo.save).not.toHaveBeenCalled();
  });

  // Declining is always allowed: saying no to something stale is not a fiction.
  it('still allows declining a request whose dates have passed', async () => {
    const { svc, bookingRepo } = makeService(base(-3));
    await expect(svc.respond(1, 'provider-1', false)).resolves.toBeDefined();
    expect(bookingRepo.save).toHaveBeenCalled();
  });
});

describe('BookingService.expireStaleBookings', () => {
  const makeService = () => {
    const execute = jest.fn(async () => ({ affected: 4 }));
    const qb: any = {
      update: jest.fn(() => qb), set: jest.fn(() => qb), where: jest.fn(() => qb), execute,
    };
    const bookingRepo = { createQueryBuilder: jest.fn(() => qb) };
    const svc = new BookingService(
      bookingRepo as any, {} as any, {} as any, {} as any, undefined as any,
    );
    return { svc, qb };
  };

  // Without this, an ignored request lived forever — and since the pending
  // unique index is partial, it barred that customer from ever asking again.
  it('expires pending requests whose dates have passed, and only those', async () => {
    const { svc, qb } = makeService();
    await svc.expireStaleBookings();
    expect(qb.set).toHaveBeenCalledWith({ status: BookingStatus.EXPIRED });
    expect(qb.where).toHaveBeenCalledWith(
      'status = :pending AND end_date < CURRENT_DATE',
      { pending: BookingStatus.PENDING },
    );
  });

  it('never lets a sweep failure escape into the scheduler', async () => {
    const { svc, qb } = makeService();
    qb.execute.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.expireStaleBookings()).resolves.toBeUndefined();
  });
});

describe('BookingService.promptReviews', () => {
  const makeService = (due: any[]) => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => due),
    };
    const bookingRepo = { createQueryBuilder: jest.fn(() => qb), update: jest.fn(async (..._a: any[]) => ({})) };
    const notifications = { notifyUsers: jest.fn(async (..._a: any[]) => undefined) };
    const svc = new BookingService(bookingRepo as any, {} as any, notifications as any, {} as any, undefined as any);
    return { svc, bookingRepo, notifications };
  };

  it('pushes each due customer once with the deep-link payload and stamps review_prompted_at', async () => {
    const due = [
      { id: 1, customer: { id: 'c1' }, provider: { id: 'p1' }, post: { id: 11 } },
      { id: 2, customer: { id: 'c2' }, provider: { id: 'p1' }, post: { id: 12 } },
    ];
    const { svc, bookingRepo, notifications } = makeService(due);
    await svc.promptReviews();

    expect(bookingRepo.update).toHaveBeenCalledTimes(1);
    expect((bookingRepo.update.mock.calls[0][0] as any).id._value).toEqual([1, 2]);
    expect((bookingRepo.update.mock.calls[0][1] as any).review_prompted_at).toBeInstanceOf(Date);
    expect(notifications.notifyUsers).toHaveBeenCalledTimes(2);
    expect(notifications.notifyUsers.mock.calls[0][0]).toEqual(['c1']);
    expect(notifications.notifyUsers.mock.calls[0][3]).toEqual({ type: 'review_prompt', bookingId: 1, postId: 11, providerId: 'p1' });
  });

  it('does nothing when no booking is due', async () => {
    const { svc, bookingRepo, notifications } = makeService([]);
    await svc.promptReviews();
    expect(bookingRepo.update).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });
});
