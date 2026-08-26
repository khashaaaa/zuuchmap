import { Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Minimal QPay v2 client.
 *
 * QPay is the rail worth having in Mongolia: one invoice yields a QR plus deep
 * links that every local banking app can open, so we never touch a card number
 * and never hold a merchant PCI obligation.
 *
 * Entirely env-gated. With `QPAY_USERNAME`/`QPAY_PASSWORD`/`QPAY_INVOICE_CODE`
 * unset, `qpayConfigured()` is false and the payment routes answer 503 rather
 * than half-working — the surrounding code is inert until real credentials
 * exist, so this ships safely before the merchant account does.
 */
const logger = new Logger('QPay');

const DEFAULT_BASE_URL = 'https://merchant.qpay.mn';

export interface QPayInvoice {
  invoice_id: string;
  qr_text: string;
  qr_image: string;
  urls: { name: string; description: string; logo: string; link: string }[];
}

export interface QPayCheckResult {
  paid: boolean;
  paid_amount: number;
}

export function qpayConfigured(): boolean {
  return !!(
    process.env.QPAY_USERNAME &&
    process.env.QPAY_PASSWORD &&
    process.env.QPAY_INVOICE_CODE
  );
}

function baseUrl(): string {
  return (process.env.QPAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function timeoutMs(): number {
  return Number(process.env.QPAY_TIMEOUT_MS ?? 10000);
}

/**
 * Cached bearer token. QPay's tokens last hours; re-authenticating per request
 * would add a round trip to every invoice and, at volume, trip their auth
 * limits. Refreshed a minute early so an in-flight call can't straddle expiry.
 */
let token: { value: string; expiresAt: number } | null = null;

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // QPay puts a machine-readable reason in the body; the status alone is
      // rarely enough to tell "bad credentials" from "invoice already settled".
      logger.warn(`${path} → ${res.status} ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('PAYMENT_PROVIDER_ERROR');
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.warn(`${path} timed out after ${timeoutMs()}ms`);
      throw new ServiceUnavailableException('PAYMENT_PROVIDER_TIMEOUT');
    }
    if (err?.status) throw err;
    logger.warn(`${path} failed: ${err?.message}`);
    throw new ServiceUnavailableException('PAYMENT_PROVIDER_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.value;

  const basic = Buffer.from(
    `${process.env.QPAY_USERNAME}:${process.env.QPAY_PASSWORD}`,
  ).toString('base64');

  const body = await request<{ access_token: string; expires_in?: number }>(
    '/v2/auth/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!body?.access_token)
    throw new ServiceUnavailableException('PAYMENT_PROVIDER_ERROR');
  // expires_in is seconds when present; fall back to an hour and refresh 60s early.
  const ttl = (Number(body.expires_in) || 3600) * 1000;
  token = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(ttl - 60_000, 30_000),
  };
  return token.value;
}

/** Drops the cached token so the next call re-authenticates. Used when QPay rejects one. */
export function resetQPayToken(): void {
  token = null;
}

export async function createQPayInvoice(params: {
  reference: string;
  receiverCode: string;
  description: string;
  amount: number;
  callbackUrl: string;
}): Promise<QPayInvoice> {
  const bearer = await accessToken();
  return request<QPayInvoice>('/v2/invoice', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      invoice_code: process.env.QPAY_INVOICE_CODE,
      sender_invoice_no: params.reference,
      invoice_receiver_code: params.receiverCode,
      invoice_description: params.description,
      amount: params.amount,
      callback_url: params.callbackUrl,
    }),
  });
}

/**
 * Ask QPay whether an invoice was settled.
 *
 * This is the only statement about money we trust. The callback URL is an
 * unauthenticated GET that anyone can replay, so it is treated purely as a
 * nudge to call this — never as proof of payment on its own. Same rule the
 * verify.mn callback already follows.
 */
export async function checkQPayInvoice(
  invoiceId: string,
): Promise<QPayCheckResult> {
  const bearer = await accessToken();
  const body = await request<{
    count?: number;
    paid_amount?: number;
    rows?: unknown[];
  }>('/v2/payment/check', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      object_type: 'INVOICE',
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });
  const paidAmount = Number(body?.paid_amount ?? 0);
  return { paid: paidAmount > 0, paid_amount: paidAmount };
}
