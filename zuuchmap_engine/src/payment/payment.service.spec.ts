import { PaymentService, monthlyPriceMnt } from './payment.service';
import { Plan } from '../enums/plan';
import { PaymentStatus } from '../enums/payment';

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
    const svc = new PaymentService(paymentsRepo, usersRepo, plans, dataSource);
    return { svc, paymentsRepo, usersRepo, plans, payment };
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

    await svc.createInvoice('user-1', Plan.PROVIDER, 3);

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

    const result = await svc.createInvoice('user-1', Plan.PROVIDER, 99);

    expect(result.months).toBe(12);
    expect(result.amount).toBe(monthlyPriceMnt(Plan.PROVIDER) * 12);
  });

  it('refuses to open an invoice for a plan nobody can buy', async () => {
    const { svc } = makeService();
    await expect(svc.createInvoice('user-1', Plan.FREE, 1)).rejects.toThrow();
  });

  it('answers 503 rather than half-working when QPay is unconfigured', async () => {
    qpay.qpayConfigured.mockReturnValue(false);
    const { svc } = makeService();
    await expect(
      svc.createInvoice('user-1', Plan.PROVIDER, 1),
    ).rejects.toThrow();
  });
});
