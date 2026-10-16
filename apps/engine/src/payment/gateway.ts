import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { QPayLink } from '@zuuchmap/core';
import { env } from '../config/env';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface GatewayInvoice { invoice_id: string; qr_text: string; qr_image: string; urls: QPayLink[] }

/**
 * The money rail. QPay in production; tests swap in a fake. `check` is the only statement about
 * money the engine trusts: QPay's callback is an unauthenticated GET anyone can replay, so it is
 * only ever a nudge to call `check`.
 */
export interface PaymentGateway {
  readonly configured: boolean;
  createInvoice(p: { reference: string; receiver: string; description: string; amount: number; callbackUrl: string }): Promise<GatewayInvoice>;
  /** The amount paid against the invoice so far. */
  check(invoiceId: string): Promise<{ paid_amount: number }>;
}

const unavailable = (code: string): never => {
  throw new ServiceUnavailableException({ message: 'Online payment is unavailable', code });
};

/** QPay merchant API v2. Inert (every call 503 PAYMENTS_NOT_CONFIGURED) until QPAY_* is set. */
export class QPayGateway implements PaymentGateway {
  private readonly log = new Logger('QPay');
  private token: { value: string; expiresAt: number } | null = null;

  get configured(): boolean {
    return env().QPAY !== undefined;
  }

  private async request<T>(path: string, init: RequestInit, retried = false): Promise<T> {
    const cfg = env().QPAY ?? unavailable('PAYMENTS_NOT_CONFIGURED');
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      ctl.abort();
    }, cfg.timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, { ...init, signal: ctl.signal });
      const text = await res.text();
      if (res.status === 401 && !retried && path !== '/v2/auth/token') {
        // A token QPay revoked early: sign in again once.
        this.token = null;
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${await this.accessToken()}`);
        return await this.request<T>(path, { ...init, headers }, true);
      }
      if (!res.ok) {
        this.log.warn(`${path} → ${String(res.status)} ${text.slice(0, 300)}`);
        return unavailable('PAYMENT_PROVIDER_ERROR');
      }
      return (text ? JSON.parse(text) : {}) as T;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        this.log.warn(`${path} timed out`);
        return unavailable('PAYMENT_PROVIDER_TIMEOUT');
      }
      this.log.warn(`${path} failed: ${err instanceof Error ? err.message : String(err)}`);
      return unavailable('PAYMENT_PROVIDER_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cached until a minute before it lapses; QPay answers `expires_in` as an epoch second or a duration. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const cfg = env().QPAY ?? unavailable('PAYMENTS_NOT_CONFIGURED');
    const basic = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
    const body = await this.request<{ access_token?: string; expires_in?: number }>('/v2/auth/token', {
      method: 'POST', headers: { Authorization: `Basic ${basic}` },
    });
    if (!body.access_token) return unavailable('PAYMENT_PROVIDER_ERROR');
    const raw = Number(body.expires_in) || 3600;
    const expiresAt = raw > 1e9 ? raw * 1000 : Date.now() + raw * 1000;
    this.token = { value: body.access_token, expiresAt: Math.max(expiresAt - 60_000, Date.now() + 30_000) };
    return this.token.value;
  }

  private async authed<T>(path: string, body: unknown): Promise<T> {
    const bearer = await this.accessToken();
    return this.request<T>(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async createInvoice(p: { reference: string; receiver: string; description: string; amount: number; callbackUrl: string }): Promise<GatewayInvoice> {
    const cfg = env().QPAY ?? unavailable('PAYMENTS_NOT_CONFIGURED');
    const r = await this.authed<Partial<GatewayInvoice>>('/v2/invoice', {
      invoice_code: cfg.invoiceCode,
      sender_invoice_no: p.reference,
      invoice_receiver_code: p.receiver,
      invoice_description: p.description,
      amount: p.amount,
      callback_url: p.callbackUrl,
    });
    if (!r.invoice_id) return unavailable('PAYMENT_PROVIDER_ERROR');
    return { invoice_id: r.invoice_id, qr_text: r.qr_text ?? '', qr_image: r.qr_image ?? '', urls: r.urls ?? [] };
  }

  async check(invoiceId: string): Promise<{ paid_amount: number }> {
    const r = await this.authed<{ paid_amount?: number; rows?: Array<{ payment_status?: string; payment_amount?: number | string }> }>(
      '/v2/payment/check',
      { object_type: 'INVOICE', object_id: invoiceId, offset: { page_number: 1, page_limit: 100 } },
    );
    const fromRows = (r.rows ?? []).filter((x) => x.payment_status === 'PAID').reduce((sum, x) => sum + Number(x.payment_amount ?? 0), 0);
    return { paid_amount: Math.max(r.paid_amount ?? 0, fromRows) };
  }
}
