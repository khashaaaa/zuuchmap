import paymentService from './paymentService';
import apiClient from './apiClient';

jest.mock('./apiClient', () => ({ get: jest.fn(), post: jest.fn() }));

/**
 * Nothing in the client decides whether money moved — `check` reads an answer
 * the engine has already verified with QPay server-to-server. What the client
 * must get right is asking for the correct thing, and telling "payments are
 * switched off" apart from "payment failed".
 */
describe('paymentService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for the plan and duration the caller chose', async () => {
    apiClient.post.mockResolvedValue({ data: { payment_id: 'p1' } });
    await paymentService.createInvoice('PROVIDER', 3);
    expect(apiClient.post).toHaveBeenCalledWith('/payments/invoice', { kind: 'PLAN', plan: 'PROVIDER', months: 3 });
  });

  it('defaults to a single month', async () => {
    apiClient.post.mockResolvedValue({ data: {} });
    await paymentService.createInvoice('PROVIDER');
    expect(apiClient.post).toHaveBeenCalledWith('/payments/invoice', { kind: 'PLAN', plan: 'PROVIDER', months: 1 });
  });

  // One endpoint sells two things. `kind` is what tells them apart, and a
  // placement invoice that forgets it would quietly open a plan invoice.
  it('asks for placement on one listing, by day', async () => {
    apiClient.post.mockResolvedValue({ data: { payment_id: 'p2', days: 14 } });
    await paymentService.createFeaturedInvoice(42, 14);
    expect(apiClient.post).toHaveBeenCalledWith('/payments/invoice', {
      kind: 'FEATURED',
      post_id: 42,
      days: 14,
    });
  });

  it('returns a list rather than undefined when there is no history', async () => {
    apiClient.get.mockResolvedValue({ data: null });
    await expect(paymentService.mine()).resolves.toEqual([]);
  });

  // "Not configured" is a deployment state, not a user error — the screen says
  // "unavailable, get in touch" instead of "your payment failed".
  it('recognises an engine with no QPay credentials', () => {
    expect(
      paymentService.isNotConfigured({ response: { data: { message: 'PAYMENTS_NOT_CONFIGURED' } } })
    ).toBe(true);
    // An unset placement price is the same shape of problem to a provider:
    // nothing is broken, the thing is simply not on sale yet.
    expect(
      paymentService.isNotConfigured({ response: { data: { message: 'FEATURED_PRICE_NOT_SET' } } })
    ).toBe(true);
    expect(paymentService.isNotConfigured({ response: { data: { message: 'BOOM' } } })).toBe(false);
    expect(paymentService.isNotConfigured(new Error('network'))).toBe(false);
  });
});
