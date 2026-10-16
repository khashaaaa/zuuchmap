import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import {
  FEATURED_MAX_DAYS, FEATURED_PACKS, INVOICE_TTL_MINUTES, PLAN_MONTHS, Plan,
  type InvoiceCreateRequest, type Payment, type PaymentCatalogue, type PaymentInvoice, type PaymentKind, type QPayLink,
} from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { env } from '../config/env';
import { LISTING_EVENTS, type ListingEventPort } from '../post/listing-events';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';

const DAY_MS = 86_400_000;
const LIVE_SQL = `approval_status = 'APPROVED' AND is_draft = false AND deleted_at IS NULL
  AND status <> 'EXPIRED' AND (expires_at IS NULL OR expires_at > now())`;
/** A pending invoice is asked about at most this often, however fast a client polls. */
const CHECK_EVERY_MS = 3_000;

interface PaymentRow {
  id: string; user_id: string; kind: PaymentKind; plan: Plan | null; months: number; post_id: number | null; post_title: string | null;
  days: number | null; amount: number; currency: 'MNT'; provider: 'QPAY' | 'MANUAL'; status: Payment['status'];
  provider_invoice_id: string | null; reference: string | null; qr_text: string | null; qr_image: string | null; urls: QPayLink[];
  expires_at: Date | null; paid_at: Date | null; granted_at: Date | null; granted_until: Date | null; date_created: Date;
}

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

const toPayment = (r: PaymentRow): Payment => ({
  id: r.id, kind: r.kind, plan: r.plan, months: r.months, post_id: r.post_id, post_title: r.post_title, days: r.days,
  amount: r.amount, currency: 'MNT', provider: r.provider, status: r.status, reference: r.reference,
  expires_at: iso(r.expires_at), paid_at: iso(r.paid_at), granted_until: iso(r.granted_until), date_created: r.date_created.toISOString(),
});

const fail = (cls: typeof BadRequestException, code: string, message: string): never => {
  throw new cls({ message, code });
};

/** Calendar months, clamped to the month's last day (Jan 31 + 1 month = Feb 28). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** The days a placement can run: what was asked, cut to the listing's remaining window (Figma P2). */
function featuredDays(requested: number, expiresAt: Date | null, now = Date.now()): number {
  if (!expiresAt) return requested;
  return Math.min(requested, Math.ceil((expiresAt.getTime() - now) / DAY_MS));
}

/**
 * Phase 8. Plans and featured placement, paid by QPay or granted by an admin. Prices come from
 * the environment and are never guessed: an unset price means that item is not for sale.
 * An invoice row is written before QPay is called, and money is believed only from `check`.
 */
@Injectable()
export class PaymentService {
  private readonly log = new Logger(PaymentService.name);
  private readonly lastCheck = new Map<string, number>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
  ) {}

  catalogue(): PaymentCatalogue {
    const e = env();
    return {
      currency: 'MNT',
      enabled: this.gateway.configured,
      support_phone: e.SUPPORT_PHONE,
      plans: [
        { plan: Plan.FREE, monthly_price: 0, posts: e.POST_QUOTA_FREE },
        { plan: Plan.PROVIDER, monthly_price: e.PLAN_PRICE_PROVIDER_MNT ?? null, posts: e.POST_QUOTA_PROVIDER },
      ],
      featured: { price_per_day: e.FEATURED_PRICE_PER_DAY_MNT ?? null, packs: [...FEATURED_PACKS], max_days: FEATURED_MAX_DAYS },
    };
  }

  private async row(id: string, em: DataSource | EntityManager = this.ds, lock = false): Promise<PaymentRow> {
    const r = (await em.query<PaymentRow[]>(`SELECT * FROM payments WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])).at(0);
    return r ?? fail(NotFoundException, 'PAYMENT_NOT_FOUND', 'Payment not found');
  }

  private async mineRow(me: RequestUser, id: string): Promise<PaymentRow> {
    const r = await this.row(id);
    if (r.user_id !== me.id && !me.is_admin) fail(NotFoundException, 'PAYMENT_NOT_FOUND', 'Payment not found');
    return r;
  }

  /** What one invoice sells, priced and checked. */
  private async line(me: RequestUser, req: InvoiceCreateRequest): Promise<{ plan: Plan | null; months: number; post_id: number | null; post_title: string | null; days: number | null; amount: number; description: string }> {
    const e = env();
    if (req.kind === 'PLAN') {
      if ((req.plan ?? Plan.PROVIDER) !== Plan.PROVIDER) fail(BadRequestException, 'PLAN_NOT_PURCHASABLE', 'Only the Provider plan is on sale');
      const months = req.months ?? 1;
      if (!(PLAN_MONTHS as readonly number[]).includes(months)) fail(BadRequestException, 'INVALID_PLAN', `Months must be one of ${PLAN_MONTHS.join(', ')}`);
      const price = e.PLAN_PRICE_PROVIDER_MNT ?? fail(ServiceUnavailableException, 'PLAN_PRICE_NOT_SET', 'The plan has no price yet');
      return { plan: Plan.PROVIDER, months, post_id: null, post_title: null, days: null, amount: price * months, description: `ZuuchMap Provider plan, ${String(months)} month(s)` };
    }
    const price = e.FEATURED_PRICE_PER_DAY_MNT ?? fail(ServiceUnavailableException, 'FEATURED_PRICE_NOT_SET', 'Featured placement has no price yet');
    if (!req.post_id) return fail(BadRequestException, 'POST_REQUIRED', 'Name the listing to feature');
    const asked = req.days ?? 7;
    if (!Number.isInteger(asked) || asked < 1 || asked > FEATURED_MAX_DAYS) fail(BadRequestException, 'POST_NOT_FEATURABLE', `Days must be 1-${String(FEATURED_MAX_DAYS)}`);
    const post = (await this.ds.query<Array<{ id: number; title: string | null; user_id: string | null; expires_at: Date | null; live: boolean }>>(
      `SELECT id, title, user_id, expires_at, (${LIVE_SQL}) AS live FROM posts WHERE id = $1`, [req.post_id],
    )).at(0) ?? fail(NotFoundException, 'POST_NOT_FOUND', 'Listing not found');
    if (post.user_id !== me.id) fail(ForbiddenException, 'NOT_POST_OWNER', 'Not your listing');
    if (!post.live) fail(BadRequestException, 'POST_NOT_FEATURABLE', 'Only a live listing can be featured');
    const days = featuredDays(asked, post.expires_at);
    if (days < 1) fail(BadRequestException, 'POST_EXPIRES_TOO_SOON', 'The listing ends within a day; renew it first');
    return { plan: null, months: 0, post_id: post.id, post_title: post.title, days, amount: price * days, description: `ZuuchMap featured listing #${String(post.id)}, ${String(days)} day(s)` };
  }

  /** Opens an invoice. A newer invoice of the same kind retires the older one, so one payment never grants twice. */
  async createInvoice(me: RequestUser, req: InvoiceCreateRequest): Promise<PaymentInvoice> {
    if (me.type !== 'PROVIDER' && !me.is_admin) fail(ForbiddenException, 'PROVIDER_ONLY', 'Providers only');
    const line = await this.line(me, req);
    if (!this.gateway.configured) fail(ServiceUnavailableException, 'PAYMENTS_NOT_CONFIGURED', 'Online payment is unavailable');
    await this.ds.query(
      `UPDATE payments SET status = 'CANCELLED', note = 'superseded by a newer invoice', date_updated = now()
        WHERE user_id = $1 AND kind = $2 AND status = 'PENDING' AND provider = 'QPAY'`,
      [me.id, req.kind],
    );
    const reference = `ZM-${randomBytes(3).toString('hex').toUpperCase()}`;
    const [created] = await this.ds.query<PaymentRow[]>(
      `INSERT INTO payments (user_id, kind, plan, months, post_id, post_title, days, amount, provider, reference, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QPAY', $9, now() + make_interval(mins => $10)) RETURNING *`,
      [me.id, req.kind, line.plan, line.months, line.post_id, line.post_title, line.days, line.amount, reference, INVOICE_TTL_MINUTES],
    );
    try {
      const inv = await this.gateway.createInvoice({
        reference, receiver: me.phone_number, description: line.description, amount: line.amount,
        callbackUrl: `${env().PUBLIC_API_URL.replace(/\/$/, '')}/payments/callback/${created.id}`,
      });
      const [saved] = await this.ds.query<[PaymentRow[], number]>(
        'UPDATE payments SET provider_invoice_id = $2, qr_text = $3, qr_image = $4, urls = $5, date_updated = now() WHERE id = $1 RETURNING *',
        [created.id, inv.invoice_id, inv.qr_text, inv.qr_image, JSON.stringify(inv.urls)],
      );
      const r = saved[0];
      return { payment: toPayment(r), qr_text: r.qr_text, qr_image: r.qr_image, urls: r.urls };
    } catch (err) {
      // QPay never issued it, so it can never be paid: keep history honest.
      await this.ds.query(`UPDATE payments SET status = 'CANCELLED', note = 'QPay refused the invoice' WHERE id = $1`, [created.id]);
      if (err instanceof ServiceUnavailableException) throw err;
      this.log.warn(`invoice ${created.id}: ${err instanceof Error ? err.message : String(err)}`);
      return fail(ServiceUnavailableException, 'PAYMENT_PROVIDER_ERROR', 'QPay did not issue the invoice');
    }
  }

  /** The invoice again (a reopened screen), with its QR while it is payable. */
  async invoice(me: RequestUser, id: string): Promise<PaymentInvoice> {
    await this.quietRefresh(id);
    const r = await this.mineRow(me, id);
    const payable = r.status === 'PENDING';
    return { payment: toPayment(r), qr_text: payable ? r.qr_text : null, qr_image: payable ? r.qr_image : null, urls: payable ? r.urls : [] };
  }

  /** Status for a polling client: asks QPay (at most every few seconds) while the invoice is pending. */
  async status(me: RequestUser, id: string): Promise<Payment> {
    await this.mineRow(me, id);
    await this.quietRefresh(id);
    return toPayment(await this.row(id));
  }

  /** A reader is answered from the row when QPay cannot be reached; the sweep catches up. */
  private async quietRefresh(id: string): Promise<void> {
    await this.refresh(id).catch((err: unknown) => {
      this.log.warn(`check ${id}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /** QPay's callback: a nudge to check, never proof. */
  async callback(id: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    await this.refresh(id, true).catch((err: unknown) => {
      this.log.warn(`callback ${id}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * Asks QPay about an invoice; settles it when paid in full, retires it when it lapsed unpaid.
   * `force` (callback, sweep) also asks about an expired or superseded invoice: money that
   * arrives late is still granted.
   */
  async refresh(id: string, force = false): Promise<void> {
    const r = (await this.ds.query<PaymentRow[]>('SELECT * FROM payments WHERE id = $1', [id])).at(0);
    if (!r || r.granted_at || r.provider !== 'QPAY' || !r.provider_invoice_id) return;
    if (r.status !== 'PENDING' && !force) return;
    const last = this.lastCheck.get(id) ?? 0;
    if (!force && Date.now() - last < CHECK_EVERY_MS) return;
    this.lastCheck.set(id, Date.now());
    const { paid_amount } = await this.gateway.check(r.provider_invoice_id);
    if (paid_amount >= r.amount) {
      await this.settle(id);
      this.lastCheck.delete(id);
    } else if (r.status === 'PENDING' && r.expires_at && r.expires_at.getTime() <= Date.now()) {
      await this.ds.query(`UPDATE payments SET status = 'EXPIRED', date_updated = now() WHERE id = $1 AND status = 'PENDING'`, [id]);
      this.lastCheck.delete(id);
    }
  }

  /**
   * Marks the payment PAID and grants it, in one transaction. The conditional UPDATE is the one
   * claim: a callback and a poll racing here grant once.
   */
  async settle(id: string): Promise<boolean> {
    const granted = await this.ds.transaction(async (em) => {
      const [rows] = await em.query<[PaymentRow[], number]>(
        `UPDATE payments SET status = 'PAID', paid_at = COALESCE(paid_at, now()), granted_at = now(), date_updated = now()
          WHERE id = $1 AND granted_at IS NULL AND status IN ('PENDING', 'EXPIRED', 'CANCELLED') RETURNING *`,
        [id],
      );
      const p = rows.at(0);
      if (!p) return null;
      const until = p.kind === 'PLAN' ? await this.grantPlan(em, p.user_id, p.months) : await this.grantFeatured(em, p.post_id, p.days ?? 0);
      await em.query('UPDATE payments SET granted_until = $2 WHERE id = $1', [id, until]);
      return p;
    });
    if (!granted) return false;
    this.events.emit({ type: 'payment.paid', payment_id: granted.id, user_id: granted.user_id });
    return true;
  }

  /** Extends from the current paid end when there is one, else from now. */
  private async grantPlan(em: EntityManager, userId: string, months: number): Promise<Date> {
    const u = (await em.query<Array<{ plan: string; plan_expires_at: Date | null }>>('SELECT plan, plan_expires_at FROM users WHERE id = $1 FOR UPDATE', [userId])).at(0);
    const now = new Date();
    const base = u?.plan === Plan.PROVIDER && u.plan_expires_at && u.plan_expires_at > now ? u.plan_expires_at : now;
    const until = addMonths(base, months);
    await em.query(`UPDATE users SET plan = 'PROVIDER', plan_expires_at = $2, date_updated = now() WHERE id = $1`, [userId, until]);
    return until;
  }

  /** Extends a running placement, never past the listing's own end. A listing gone since the invoice still records the payment. */
  private async grantFeatured(em: EntityManager, postId: number | null, days: number): Promise<Date | null> {
    if (!postId || days < 1) return null;
    const p = (await em.query<Array<{ featured_until: Date | null; expires_at: Date | null }>>(
      'SELECT featured_until, expires_at FROM posts WHERE id = $1 FOR UPDATE', [postId],
    )).at(0);
    if (!p) return null;
    const now = Date.now();
    const base = p.featured_until && p.featured_until.getTime() > now ? p.featured_until.getTime() : now;
    let until = base + days * DAY_MS;
    if (p.expires_at) until = Math.min(until, p.expires_at.getTime());
    if (until <= now) return null;
    const end = new Date(until);
    await em.query('UPDATE posts SET is_featured = true, featured_until = $2, date_updated = now() WHERE id = $1', [postId, end]);
    return end;
  }

  async mine(me: RequestUser): Promise<Payment[]> {
    const rows = await this.ds.query<PaymentRow[]>(
      `SELECT * FROM payments WHERE user_id = $1 AND NOT (status = 'CANCELLED' AND provider_invoice_id IS NULL)
        ORDER BY date_created DESC LIMIT 100`,
      [me.id],
    );
    return rows.map(toPayment);
  }

  /** Figma P8: tapping a row e-mails its receipt again. */
  async resendReceipt(me: RequestUser, id: string): Promise<{ ok: true }> {
    const r = await this.mineRow(me, id);
    if (r.status !== 'PAID') fail(BadRequestException, 'PAYMENT_NOT_FOUND', 'Only a paid payment has a receipt');
    this.events.emit({ type: 'payment.paid', payment_id: r.id, user_id: r.user_id, resend: true });
    return { ok: true };
  }

  // ---- admin grants (Figma J11d) --------------------------------------------------

  /** A plan granted without payment: recorded as a MANUAL payment of 0₮ so history explains it. */
  async adminGrantPlan(admin: RequestUser, userId: string, months: number): Promise<Payment> {
    if (!(PLAN_MONTHS as readonly number[]).includes(months)) fail(BadRequestException, 'INVALID_PLAN', `Months must be one of ${PLAN_MONTHS.join(', ')}`);
    await this.assertUser(userId);
    const [p] = await this.ds.query<PaymentRow[]>(
      `INSERT INTO payments (user_id, kind, plan, months, amount, provider, granted_by, note)
       VALUES ($1, 'PLAN', 'PROVIDER', $2, 0, 'MANUAL', $3, 'granted by an admin') RETURNING *`,
      [userId, months, admin.id],
    );
    await this.settle(p.id);
    return toPayment(await this.row(p.id));
  }

  async adminRevokePlan(userId: string): Promise<{ ok: true }> {
    await this.assertUser(userId);
    await this.ds.query(`UPDATE users SET plan = 'FREE', plan_expires_at = NULL, date_updated = now() WHERE id = $1`, [userId]);
    return { ok: true };
  }

  async adminGrantFeatured(admin: RequestUser, postId: number, days: number): Promise<Payment> {
    if (!Number.isInteger(days) || days < 1 || days > FEATURED_MAX_DAYS) fail(BadRequestException, 'POST_NOT_FEATURABLE', `Days must be 1-${String(FEATURED_MAX_DAYS)}`);
    const post = (await this.ds.query<Array<{ id: number; title: string | null; user_id: string | null; expires_at: Date | null; live: boolean }>>(
      `SELECT id, title, user_id, expires_at, (${LIVE_SQL}) AS live FROM posts WHERE id = $1`, [postId],
    )).at(0) ?? fail(NotFoundException, 'POST_NOT_FOUND', 'Listing not found');
    if (!post.live || !post.user_id) fail(BadRequestException, 'POST_NOT_FEATURABLE', 'Only a live listing can be featured');
    const granted = featuredDays(days, post.expires_at);
    if (granted < 1) fail(BadRequestException, 'POST_EXPIRES_TOO_SOON', 'The listing ends within a day');
    const [p] = await this.ds.query<PaymentRow[]>(
      `INSERT INTO payments (user_id, kind, post_id, post_title, days, amount, provider, granted_by, note)
       VALUES ($1, 'FEATURED', $2, $3, $4, 0, 'MANUAL', $5, 'granted by an admin') RETURNING *`,
      [post.user_id, post.id, post.title, granted, admin.id],
    );
    await this.settle(p.id);
    return toPayment(await this.row(p.id));
  }

  private async assertUser(id: string): Promise<void> {
    const r = await this.ds.query<unknown[]>('SELECT 1 FROM users WHERE id = $1', [id]);
    if (!r.length) fail(NotFoundException, 'USER_NOT_FOUND', 'User not found');
  }

  async forUser(userId: string): Promise<Payment[]> {
    const rows = await this.ds.query<PaymentRow[]>('SELECT * FROM payments WHERE user_id = $1 AND status <> \'CANCELLED\' ORDER BY date_created DESC LIMIT 50', [userId]);
    return rows.map(toPayment);
  }

  // ---- sweeps --------------------------------------------------------------------

  /** Pending invoices: settle what was paid while nobody was watching, retire what lapsed. */
  async sweepPending(): Promise<number> {
    const rows = await this.ds.query<Array<{ id: string }>>(
      `SELECT id FROM payments
        WHERE provider = 'QPAY' AND provider_invoice_id IS NOT NULL AND granted_at IS NULL
          AND (status = 'PENDING' OR date_created > now() - interval '1 day')
          AND status <> 'PAID' AND date_created > now() - interval '2 days'
        ORDER BY date_created LIMIT 200`,
    );
    for (const r of rows) {
      await this.refresh(r.id, true).catch((err: unknown) => {
        this.log.warn(`sweep ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    // Never answered by QPay at all (no invoice id): retire once lapsed.
    await this.ds.query(`UPDATE payments SET status = 'EXPIRED', date_updated = now() WHERE status = 'PENDING' AND expires_at < now() AND provider_invoice_id IS NULL`);
    return rows.length;
  }

  /** A placement that ran out stops lifting its listing. */
  async expireFeatured(): Promise<number> {
    const res = await this.ds.query<[unknown, number]>(
      'UPDATE posts SET is_featured = false WHERE is_featured = true AND (featured_until IS NULL OR featured_until <= now())',
    );
    return res[1];
  }
}
