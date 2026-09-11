/**
 * What an invoice buys.
 *
 * Two products share one payment table because they share the whole settlement
 * path — the pre-write row, the `granted_at` latch, the callback, the sweep —
 * and that path is the only code in the product that decides whether someone
 * got what they paid for. A second table would be a second copy of it.
 */
export enum PaymentKind {
  /** Months of a provider plan. Grants against `user.plan`. */
  PLAN = 'PLAN',
  /** Days of featured placement on one post. Grants against `post.featured_until`. */
  FEATURED = 'FEATURED',
}

export const isPaymentKind = (v: unknown): v is PaymentKind =>
  typeof v === 'string' &&
  Object.values(PaymentKind).includes(v as PaymentKind);

/** Where the money came from. */
export enum PaymentProvider {
  /** QPay — the bank-agnostic QR rail every Mongolian banking app can scan. */
  QPAY = 'QPAY',
  /** Bank transfer reconciled by hand, then granted from the admin UI. */
  MANUAL = 'MANUAL',
}

/**
 * PENDING → PAID (callback or poll confirmed the funds)
 * PENDING → EXPIRED (invoice outlived INVOICE_TTL and was swept)
 * PENDING → CANCELLED (the provider abandoned it and started another)
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export const isPaymentStatus = (v: unknown): v is PaymentStatus =>
  typeof v === 'string' &&
  Object.values(PaymentStatus).includes(v as PaymentStatus);
