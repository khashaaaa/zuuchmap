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
