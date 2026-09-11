import { PaymentService, monthlyPriceMnt } from './payment.service';
import { Plan } from '../enums/plan';
import { PaymentKind, PaymentStatus } from '../enums/payment';

jest.mock('../post/featured', () => ({
  ...jest.requireActual('../post/featured'),
  openFeaturedWindow: jest.fn(async () => ({
    featured_until: new Date('2026-10-01'),
  })),
}));

const featured = require('../post/featured');

jest.mock('./qpay.client', () => ({
  qpayConfigured: jest.fn(() => true),
  createQPayInvoice: jest.fn(),
  checkQPayInvoice: jest.fn(),
}));

const qpay = require('./qpay.client');

/**
 * The settlement path is the only code in the product that decides whether a
 * provider got what they paid for, and it is driven by an unauthenticated URL
 * QPay may retry while the client polls the same invoice. These tests are
 * about the two ways that goes wrong: granting twice, and granting for less.
 */
describe('PaymentService', () => {
  const makeService = (
    opts: {
      payment?: any;
      user?: any;
      post?: any;
      transactionResult?: any;
    } = {},
  ) => {
    const payment = opts.payment ?? {
      id: 'pay-1',
      user: { id: 'user-1' },
      plan: Plan.PROVIDER,
      months: 1,
      amount: 49900,
      status: PaymentStatus.PENDING,
      provider_invoice_id: 'qpay-1',
      granted_at: null,
      paid_at: null,
    };
    const paymentsRepo: any = {
      findOne: jest.fn(async () => payment),
      find: jest.fn(async () => []),
      save: jest.fn(async (row: any) => ({ ...payment, ...row })),
      create: jest.fn((row: any) => row),
      update: jest.fn(async () => ({ affected: 1 })),
      count: jest.fn(async () => 0),
    };
    const usersRepo: any = {
      findOne: jest.fn(
        async () =>
          opts.user ?? {
            id: 'user-1',
            phone_number: '99112233',
            plan: Plan.PROVIDER,
            plan_expires_at: new Date('2026-10-01'),
          },
      ),
    };
    const postsRepo: any = {
      findOne: jest.fn(async () =>
        opts.post === undefined
          ? {
              id: 7,
              title: 'Komatsu PC200-8',
              user: { id: 'user-1' },
              approval_status: 'APPROVED',
              status: 'ACTIVE',
              expires_at: new Date(Date.now() + 60 * 86400000),
              featured_until: null,
            }
          : opts.post,
      ),
      save: jest.fn(async (row: any) => row),
    };
    const plans: any = {
      setPlan: jest.fn(async () => ({
        plan: Plan.PROVIDER,
        plan_expires_at: new Date('2026-10-01'),
      })),
    };
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => {
        const em = {
          findOne: jest.fn(async () =>
            opts.transactionResult === undefined
              ? payment
              : opts.transactionResult,
          ),
          save: jest.fn(async (row: any) => row),
          create: jest.fn((_: any, row: any) => row),
          update: jest.fn(async () => ({ affected: 1 })),
        };
        return cb(em);
      }),
    };
    const svc = new PaymentService(
      paymentsRepo,
      usersRepo,
      postsRepo,
      plans,
      dataSource,
    );
    return { svc, paymentsRepo, usersRepo, postsRepo, plans, payment };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    qpay.qpayConfigured.mockReturnValue(true);
  });

  it('grants the plan once when the invoice is settled', async () => {
    qpay.checkQPayInvoice.mockResolvedValue({ paid: true, paid_amount: 49900 });
    const { svc, plans } = makeService();

    const result = await svc.check('pay-1');

    expect(result.status).toBe(PaymentStatus.PAID);
    expect(plans.setPlan).toHaveBeenCalledWith('user-1', Plan.PROVIDER, 1);
  });

  // The retry and the client's poll race each other by design; whichever loses
  // must find the work already done rather than buying a second month.
  it('does not grant twice when the callback is replayed', async () => {
    qpay.checkQPayInvoice.mockResolvedValue({ paid: true, paid_amount: 49900 });
    const alreadySettled = {
      id: 'pay-1',
      user: { id: 'user-1' },
      plan: Plan.PROVIDER,
      months: 1,
      amount: 49900,
      status: PaymentStatus.PENDING,
      provider_invoice_id: 'qpay-1',
      granted_at: new Date(),
      paid_at: new Date(),
    };
    const { svc, plans } = makeService({ transactionResult: alreadySettled });

    const result = await svc.check('pay-1');

    expect(result.status).toBe(PaymentStatus.PAID);
    expect(plans.setPlan).not.toHaveBeenCalled();
  });

  // A partial transfer is a real QPay outcome. Granting a month for part of a
  // month's price is the cheapest hole anyone could find in this.
  it('refuses to grant on an underpayment', async () => {
    qpay.checkQPayInvoice.mockResolvedValue({ paid: true, paid_amount: 1000 });
    const { svc, plans } = makeService();

    const result = await svc.check('pay-1');

    expect(result.status).toBe(PaymentStatus.PENDING);
    expect(plans.setPlan).not.toHaveBeenCalled();
  });

  it('reports PAID without re-asking the provider once settled', async () => {
    const paid = {
      id: 'pay-1',
      user: { id: 'user-1' },
      plan: Plan.PROVIDER,
      months: 1,
      amount: 49900,
      status: PaymentStatus.PAID,
      provider_invoice_id: 'qpay-1',
      granted_at: new Date(),
      paid_at: new Date(),
    };
    const { svc } = makeService({ payment: paid });

    const result = await svc.check('pay-1');

    expect(result.status).toBe(PaymentStatus.PAID);
    expect(qpay.checkQPayInvoice).not.toHaveBeenCalled();
  });

  // A callback that throws must not put QPay into a retry loop over something
  // retrying cannot fix.
  it('always answers the callback, even when the check fails', async () => {
    qpay.checkQPayInvoice.mockRejectedValue(new Error('provider down'));
    const { svc } = makeService();

    await expect(svc.handleCallback('pay-1')).resolves.toEqual({
      received: true,
    });
  });

  it('cancels the previous pending invoice before opening a new one', async () => {
    qpay.createQPayInvoice.mockResolvedValue({
      invoice_id: 'qpay-2',
      qr_text: 'x',
      qr_image: 'y',
      urls: [],
    });
    const { svc, paymentsRepo } = makeService();

    await svc.createInvoice('user-1', { plan: Plan.PROVIDER, months: 3 });

    expect(paymentsRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.PENDING }),
      expect.objectContaining({ status: PaymentStatus.CANCELLED }),
    );
  });

  it('clamps months into the buyable range and prices from it', async () => {
    qpay.createQPayInvoice.mockResolvedValue({
      invoice_id: 'qpay-3',
      qr_text: 'x',
      qr_image: 'y',
      urls: [],
    });
    const { svc } = makeService();

    const result = await svc.createInvoice('user-1', { plan: Plan.PROVIDER, months: 99 });

    expect(result.months).toBe(12);
    expect(result.amount).toBe(monthlyPriceMnt(Plan.PROVIDER) * 12);
  });

  it('refuses to open an invoice for a plan nobody can buy', async () => {
    const { svc } = makeService();
    await expect(
      svc.createInvoice('user-1', { plan: Plan.FREE, months: 1 }),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // Featured placement
  //
  // Placement is the second thing anyone can buy, and it settles through the
  // same latch as a plan. What is different — and what these cover — is that
  // it can be sold against a listing that is not actually in browse, or that
  // will lapse before the window does. Both are ways of taking money for
  // nothing that nobody would notice from the inside.
  // ---------------------------------------------------------------------

  const withFeaturedPrice = (mnt: string | undefined, fn: () => Promise<void>) => {
    const before = process.env.FEATURED_PRICE_PER_DAY_MNT;
    if (mnt === undefined) delete process.env.FEATURED_PRICE_PER_DAY_MNT;
    else process.env.FEATURED_PRICE_PER_DAY_MNT = mnt;
    return fn().finally(() => {
      if (before === undefined) delete process.env.FEATURED_PRICE_PER_DAY_MNT;
      else process.env.FEATURED_PRICE_PER_DAY_MNT = before;
    });
  };

  const invoiceOk = () =>
    qpay.createQPayInvoice.mockResolvedValue({
      invoice_id: 'qpay-f',
      qr_text: 'x',
      qr_image: 'y',
      urls: [],
    });

  it('prices placement per day and reports the days bought', () =>
    withFeaturedPrice('2000', async () => {
      invoiceOk();
      const { svc } = makeService();

      const result = await svc.createInvoice('user-1', {
        kind: PaymentKind.FEATURED,
        post_id: 7,
        days: 14,
      });

      expect(result.kind).toBe(PaymentKind.FEATURED);
      expect(result.days).toBe(14);
      expect(result.amount).toBe(2000 * 14);
      expect(result.post_id).toBe(7);
    }));

  // An unset price is not a zero price. Selling placement for nothing, or for
  // a number nobody chose, are the two ways this goes wrong quietly.
  it('will not sell placement until a price is set', () =>
    withFeaturedPrice(undefined, async () => {
      invoiceOk();
      const { svc } = makeService();
      await expect(
        svc.createInvoice('user-1', { kind: PaymentKind.FEATURED, post_id: 7 }),
      ).rejects.toThrow();
    }));

  it('refuses placement on somebody else\'s listing', () =>
    withFeaturedPrice('2000', async () => {
      invoiceOk();
      const { svc } = makeService({
        post: {
          id: 7,
          user: { id: 'someone-else' },
          approval_status: 'APPROVED',
          status: 'ACTIVE',
          expires_at: null,
        },
      });
      await expect(
        svc.createInvoice('user-1', { kind: PaymentKind.FEATURED, post_id: 7 }),
      ).rejects.toThrow();
    }));

  // Placement sorts listings that are already in browse. A window on a post
  // awaiting moderation buys a position in a list it does not appear in.
  it('refuses placement on a listing that is not live', () =>
    withFeaturedPrice('2000', async () => {
      invoiceOk();
      const { svc } = makeService({
        post: {
          id: 7,
          user: { id: 'user-1' },
          approval_status: 'PENDING',
          status: 'ACTIVE',
          expires_at: null,
        },
      });
      await expect(
        svc.createInvoice('user-1', { kind: PaymentKind.FEATURED, post_id: 7 }),
      ).rejects.toThrow();
    }));

  it('never sells more days than the listing has left', () =>
    withFeaturedPrice('2000', async () => {
      invoiceOk();
      const { svc } = makeService({
        post: {
          id: 7,
          user: { id: 'user-1' },
          approval_status: 'APPROVED',
          status: 'ACTIVE',
          expires_at: new Date(Date.now() + 3 * 86400000),
        },
      });

      const result = await svc.createInvoice('user-1', {
        kind: PaymentKind.FEATURED,
        post_id: 7,
        days: 30,
      });

      expect(result.days).toBe(3);
      expect(result.amount).toBe(2000 * 3);
    }));

  it('opens the window exactly once when a placement invoice settles', async () => {
    qpay.checkQPayInvoice.mockResolvedValue({ paid: true, paid_amount: 28000 });
    const { svc, plans } = makeService({
      payment: {
        id: 'pay-f',
        user: { id: 'user-1' },
        kind: PaymentKind.FEATURED,
        plan: null,
        months: 1,
        post: { id: 7 },
        days: 14,
        amount: 28000,
        status: PaymentStatus.PENDING,
        provider_invoice_id: 'qpay-f',
        granted_at: null,
        paid_at: null,
      },
    });

    const result = await svc.check('pay-f');

    expect(result.status).toBe(PaymentStatus.PAID);
    expect(featured.openFeaturedWindow).toHaveBeenCalledWith(
      expect.anything(),
      7,
      14,
    );
    // Placement must never touch plan entitlement — they are separate products
    // and a FREE provider is allowed to buy one without becoming a paid one.
    expect(plans.setPlan).not.toHaveBeenCalled();
  });

  it('does not reopen the window when the callback is replayed', async () => {
    qpay.checkQPayInvoice.mockResolvedValue({ paid: true, paid_amount: 28000 });
    const settled = {
      id: 'pay-f',
      user: { id: 'user-1' },
      kind: PaymentKind.FEATURED,
      plan: null,
      months: 1,
      post: { id: 7 },
      days: 14,
      amount: 28000,
      status: PaymentStatus.PENDING,
      provider_invoice_id: 'qpay-f',
      granted_at: new Date(),
      paid_at: new Date(),
    };
    const { svc } = makeService({
      payment: settled,
      transactionResult: settled,
    });

    const result = await svc.check('pay-f');

    expect(result.status).toBe(PaymentStatus.PAID);
    expect(featured.openFeaturedWindow).not.toHaveBeenCalled();
  });

  // Two products, one till: opening a placement invoice must not retire a plan
  // invoice the provider is about to pay in another tab.
  it('supersedes only invoices of the same kind', () =>
    withFeaturedPrice('2000', async () => {
      invoiceOk();
      const { svc, paymentsRepo } = makeService();

      await svc.createInvoice('user-1', {
        kind: PaymentKind.FEATURED,
        post_id: 7,
        days: 7,
      });

      expect(paymentsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ kind: PaymentKind.FEATURED }),
        expect.objectContaining({ status: PaymentStatus.CANCELLED }),
      );
    }));

  it('answers 503 rather than half-working when QPay is unconfigured', async () => {
    qpay.qpayConfigured.mockReturnValue(false);
    const { svc } = makeService();
    await expect(
      svc.createInvoice('user-1', { plan: Plan.PROVIDER, months: 1 }),
    ).rejects.toThrow();
  });
});
