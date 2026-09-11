import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { User } from '../user/entities/user.entity';
import { Post } from '../post/entities/post.entity';
import { PlanService } from '../user/plan.service';
import { Plan } from '../enums/plan';
import { PaymentKind, PaymentProvider, PaymentStatus } from '../enums/payment';
import { openFeaturedWindow, MAX_FEATURED_DAYS } from '../post/featured';
import { Status } from '../enums/status';
import {
  checkQPayInvoice,
  createQPayInvoice,
  qpayConfigured,
  QPayInvoice,
} from './qpay.client';
import { captureError } from '../utils/observability';
import { sendMail, mailerConfigured } from '../utils/mailer';

/** How long an unpaid invoice stays live before the sweep retires it. */
const INVOICE_TTL_MS = 60 * 60 * 1000; // 1 h
const MAX_MONTHS = 12;

/**
 * The tögrög price of one month of each paid plan.
 *
 * Env-driven because a price is a business decision that must be changeable
 * without a deploy, and because the number below is a placeholder until the
 * real one is set. FREE is listed at 0 so the catalogue endpoint can describe
 * the whole ladder from one source.
 */
export function monthlyPriceMnt(plan: string): number {
  if (plan === Plan.PROVIDER)
    return Number(process.env.PLAN_PRICE_PROVIDER_MNT ?? 49900);
  return 0;
}

/**
 * The tögrög price of one day of featured placement.
 *
 * Deliberately has **no default**. The plan price ships with a placeholder and
 * that is a known hazard — the first invoice would charge a number nobody
 * chose. Repeating it here would be repeating it knowingly, so an unset
 * variable means placement is simply not for sale: the catalogue says so and
 * the invoice endpoint refuses, which is a state someone will notice.
 */
export function featuredPricePerDayMnt(): number {
  const raw = process.env.FEATURED_PRICE_PER_DAY_MNT;
  const value = Number(raw);
  return raw && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Day counts the clients offer as one-tap choices. */
export const FEATURED_PACKS = [7, 14, 30] as const;

/** What a settled (or already-settled) invoice reports back. */
type SettlementResult = {
  status: string;
  plan?: string;
  plan_expires_at?: Date | null;
  post_id?: number | null;
  featured_until?: Date | null;
};

/** What one invoice is for. */
type InvoiceRequest = {
  kind?: string;
  plan?: string;
  months?: number;
  post_id?: number;
  days?: number;
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    private readonly plans: PlanService,
    private readonly dataSource: DataSource,
  ) {}

  /** What a client renders on the upgrade screen. Safe to call anonymously. */
  catalogue() {
    const perDay = featuredPricePerDayMnt();
    return {
      currency: 'MNT',
      enabled: qpayConfigured(),
      plans: [
        { plan: Plan.FREE, monthly_price: 0, posts: 3 },
        {
          plan: Plan.PROVIDER,
          monthly_price: monthlyPriceMnt(Plan.PROVIDER),
          posts: 25,
        },
      ],
      /**
       * Placement is priced and sold separately from the plan ladder: it buys
       * attention on one listing, not entitlement on the account, and a FREE
       * provider is as welcome to buy it as a paid one.
       */
      featured: {
        enabled: qpayConfigured() && perDay > 0,
        price_per_day: perDay,
        min_days: 1,
        max_days: MAX_FEATURED_DAYS,
        packs: [...FEATURED_PACKS],
      },
    };
  }

  /**
   * Open an invoice.
   *
   * The row is written before QPay is called, so a request that dies between
   * "invoice created upstream" and "response reached us" leaves a PENDING row
   * the sweep can still settle. The reverse ordering loses money silently.
   */
  async createInvoice(
    userId: string,
    req: InvoiceRequest,
  ): Promise<{
    payment_id: string;
    kind: string;
    amount: number;
    currency: string;
    months: number;
    plan: string | null;
    post_id: number | null;
    days: number | null;
    qr_text: string;
    qr_image: string;
    urls: QPayInvoice['urls'];
  }> {
    if (!qpayConfigured())
      throw new ServiceUnavailableException('PAYMENTS_NOT_CONFIGURED');

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const kind =
      req.kind === PaymentKind.FEATURED ? PaymentKind.FEATURED : PaymentKind.PLAN;
    const line =
      kind === PaymentKind.FEATURED
        ? await this.featuredLine(userId, req)
        : this.planLine(req);

    // Abandoning a QR and opening another is normal behaviour; leaving the old
    // one settleable is not — it would grant a second window for one payment.
    //
    // Scoped to the same kind: a provider who opens a placement invoice while
    // a plan invoice is still on another tab has not abandoned the plan one,
    // and cancelling it would strand a payment they are about to make.
    await this.payments.update(
      { user: { id: userId }, kind, status: PaymentStatus.PENDING },
      {
        status: PaymentStatus.CANCELLED,
        note: 'superseded by a newer invoice',
      },
    );

    const payment = await this.payments.save(
      this.payments.create({
        user,
        kind,
        plan: line.plan,
        months: line.months,
        post: line.post,
        days: line.days,
        amount: line.amount,
        currency: 'MNT',
        provider: PaymentProvider.QPAY,
        status: PaymentStatus.PENDING,
      }),
    );

    // Human-readable and unique per attempt — this is the string that appears
    // on the bank line when someone has to reconcile one by hand.
    const reference = `ZM-${payment.id.slice(0, 8).toUpperCase()}`;

    try {
      const invoice = await createQPayInvoice({
        reference,
        receiverCode: user.phone_number ?? userId,
        description: line.description,
        amount: line.amount,
        callbackUrl: `${this.publicEngineUrl()}/engine/payments/callback/${payment.id}`,
      });

      payment.provider_invoice_id = invoice.invoice_id;
      payment.reference = reference;
      await this.payments.save(payment);

      return {
        payment_id: payment.id,
        kind,
        amount: line.amount,
        currency: 'MNT',
        months: line.months,
        plan: line.plan,
        post_id: line.post?.id ?? null,
        days: line.days,
        qr_text: invoice.qr_text,
        qr_image: invoice.qr_image,
        urls: invoice.urls ?? [],
      };
    } catch (err) {
      // The upstream call failed, so this row can never be paid. Retiring it
      // keeps `mine` honest instead of showing a QR that was never issued.
      payment.status = PaymentStatus.CANCELLED;
      payment.note = 'provider rejected the invoice';
      await this.payments.save(payment).catch(() => undefined);
      throw err;
    }
  }

  /** Months of a plan: what the till sold before placement existed. */
  private planLine(req: InvoiceRequest) {
    const plan = req.plan ?? Plan.PROVIDER;
    if (plan !== Plan.PROVIDER)
      throw new BadRequestException('PLAN_NOT_PURCHASABLE');
    const unit = monthlyPriceMnt(plan);
    if (unit <= 0) throw new ServiceUnavailableException('PLAN_PRICE_NOT_SET');
    const months = Math.min(
      Math.max(Math.floor(req.months ?? 1) || 1, 1),
      MAX_MONTHS,
    );
    return {
      plan,
      months,
      post: null as Post | null,
      days: null as number | null,
      amount: unit * months,
      description: `Zuuchmap ${plan} — ${months} сар`,
    };
  }

  /**
   * Days of placement on one post.
   *
   * Three things have to be true before this is a sale rather than a donation:
   * the post has to be the caller's, it has to be *in* browse (placement sorts
   * listings that are already there — a window on a PENDING or EXPIRED post
   * buys nothing at all), and the window must not outlast the listing. The
   * last one is why `days` is clamped rather than taken on trust: selling
   * thirty days of prominence to a post that lapses on Thursday is taking
   * money for nothing, and the provider would have no way to see it happen.
   */
  private async featuredLine(userId: string, req: InvoiceRequest) {
    const perDay = featuredPricePerDayMnt();
    if (perDay <= 0)
      throw new ServiceUnavailableException('FEATURED_PRICE_NOT_SET');

    const postId = Number(req.post_id);
    if (!Number.isInteger(postId) || postId <= 0)
      throw new BadRequestException('POST_REQUIRED');

    const post = await this.posts.findOne({
      where: { id: postId },
      relations: ['user'],
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.user?.id !== userId) throw new BadRequestException('NOT_POST_OWNER');
    if (post.approval_status !== 'APPROVED' || post.status !== Status.ACTIVE)
      throw new BadRequestException('POST_NOT_FEATURABLE');

    let days = Math.min(
      Math.max(Math.floor(req.days ?? 7) || 7, 1),
      MAX_FEATURED_DAYS,
    );

    if (post.expires_at) {
      const msLeft = new Date(post.expires_at).getTime() - Date.now();
      const daysLeft = Math.floor(msLeft / 86_400_000);
      if (daysLeft < 1) throw new BadRequestException('POST_EXPIRES_TOO_SOON');
      days = Math.min(days, daysLeft);
    }

    return {
      plan: null as string | null,
      months: 1,
      post,
      days,
      amount: perDay * days,
      description: `Zuuchmap онцлох байршуулалт — ${days} хоног`,
    };
  }

  /**
   * Ask the provider whether an invoice settled, and grant the plan if it did.
   *
   * Every path that could grant a plan funnels through here, because this is
   * the only function that talks to QPay about money. `userId`, when given,
   * scopes the lookup so one provider cannot poll another's invoice.
   */
  async check(paymentId: string, userId?: string): Promise<SettlementResult> {
    const where: Record<string, unknown> = { id: paymentId };
    if (userId) where.user = { id: userId };
    const payment = await this.payments.findOne({
      where: where,
      relations: ['user', 'post'],
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status === PaymentStatus.PAID) {
      return this.settledShape(payment);
    }
    if (
      payment.status !== PaymentStatus.PENDING ||
      !payment.provider_invoice_id
    ) {
      return { status: payment.status };
    }

    const result = await checkQPayInvoice(payment.provider_invoice_id);
    if (!result.paid) return { status: PaymentStatus.PENDING };

    // Underpayment is a real QPay outcome (a partial transfer). Granting a
    // month for less than a month's price would be a hole worth finding.
    if (result.paid_amount < payment.amount) {
      this.logger.warn(
        `Payment ${payment.id} underpaid: ${result.paid_amount} of ${payment.amount} — not granting`,
      );
      return { status: PaymentStatus.PENDING };
    }

    return this.settle(payment.id);
  }

  /**
   * Mark paid and grant the plan, exactly once.
   *
   * The callback is an unauthenticated URL QPay may retry, and the client polls
   * the same invoice in parallel, so concurrent settlement is the expected
   * case, not the edge case. A row-level lock plus the `granted_at` latch means
   * the second caller through finds the work already done rather than adding a
   * second month.
   */
  private async settle(paymentId: string): Promise<SettlementResult> {
    // The lock exists to guard one boolean: whether `granted_at` was already
    // stamped. Everything else on the row — which product, which post, how
    // many days, how much — is written once when the invoice is opened and
    // never changes, so it is read outside the lock rather than joined into
    // it. That is not only simpler: Postgres refuses `FOR UPDATE` across the
    // nullable side of an outer join, and `post` is nullable, so loading it
    // here would make every settlement 500 instead of granting.
    const granted = await this.dataSource.transaction(async (em) => {
      const row = await em.findOne(Payment, {
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Payment not found');
      if (row.granted_at) return false; // already settled by the other caller

      row.status = PaymentStatus.PAID;
      row.paid_at = row.paid_at ?? new Date();
      row.granted_at = new Date();
      await em.save(row);
      return true;
    });

    const row = await this.payments.findOne({
      where: { id: paymentId },
      relations: ['user', 'post'],
    });
    if (!row) return { status: PaymentStatus.PAID };

    // Whoever loses the race still has to be told what the winner granted.
    if (!granted) return this.settledShape(row);

    // Fire-and-forget: a receipt that fails to send must never unwind
    // something the provider has already paid for.
    const receipt = () =>
      void this.emailReceipt(paymentId).catch(() => undefined);

    if (row.kind === PaymentKind.FEATURED) {
      if (!row.post?.id) {
        // The listing was deleted between paying and settling. The row stays
        // PAID — the money moved — and says so loudly rather than silently
        // granting a window on nothing.
        this.logger.warn(
          `Payment ${paymentId} settled but its post is gone; no window opened`,
        );
        receipt();
        return {
          status: PaymentStatus.PAID,
          post_id: null,
          featured_until: null,
        };
      }
      const { featured_until } = await openFeaturedWindow(
        this.posts,
        row.post.id,
        row.days ?? 0,
      );
      this.logger.log(
        `Payment ${paymentId} settled → featured #${row.post.id} for ${row.days}d until ${featured_until?.toISOString() ?? 'n/a'}`,
      );
      receipt();
      return {
        status: PaymentStatus.PAID,
        post_id: row.post.id,
        featured_until,
      };
    }

    const result = await this.plans.setPlan(
      row.user.id,
      row.plan ?? Plan.PROVIDER,
      row.months,
    );
    this.logger.log(
      `Payment ${paymentId} settled → ${row.plan} x${row.months} for ${row.user.id}`,
    );
    receipt();
    return { status: PaymentStatus.PAID, ...result };
  }

  /** What an already-settled invoice reports back, by product. */
  private async settledShape(payment: Payment): Promise<SettlementResult> {
    if (payment.kind === PaymentKind.FEATURED) {
      const post = payment.post
        ? await this.posts.findOne({ where: { id: payment.post.id } })
        : null;
      return {
        status: PaymentStatus.PAID,
        post_id: post?.id ?? null,
        featured_until: post?.featured_until ?? null,
      };
    }
    const user = await this.users.findOne({ where: { id: payment.user.id } });
    return {
      status: PaymentStatus.PAID,
      plan: user?.plan ?? undefined,
      plan_expires_at: user?.plan_expires_at ?? null,
    };
  }

  /**
   * QPay's nudge. Unauthenticated by construction — anyone can hit it — so it
   * proves nothing on its own and only triggers the authenticated check above.
   * Always answers 200: a non-2xx puts QPay into a retry loop that will not
   * fix whatever went wrong here.
   */
  async handleCallback(paymentId: string): Promise<{ received: true }> {
    try {
      await this.check(paymentId);
    } catch (err) {
      this.logger.warn(
        `Callback for ${paymentId} failed: ${(err as Error)?.message}`,
      );
      captureError(err, { kind: 'payment-callback', paymentId });
    }
    return { received: true };
  }

  /** A provider's own payment history — the receipts half of the feature. */
  async mine(userId: string) {
    const rows = await this.payments.find({
      where: { user: { id: userId } },
      order: { date_created: 'DESC' },
      relations: ['post'],
      take: 50,
    });
    return rows.map((p) => ({
      id: p.id,
      kind: p.kind,
      plan: p.plan,
      months: p.months,
      days: p.days,
      // The title is carried so a receipt list can name the listing without a
      // request per row — and stays readable as `null` once the post is gone,
      // which is the whole reason the relation is `SET NULL`.
      post: p.post ? { id: p.post.id, title: p.post.title ?? null } : null,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      reference: p.reference,
      paid_at: p.paid_at,
      date_created: p.date_created,
    }));
  }

  /**
   * Hourly sweep: give every stale PENDING invoice one last check before
   * retiring it. A callback that never arrived and a client that closed the
   * tab before polling look identical from here, and both mean a provider paid
   * and is waiting. This is the net under them.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepPendingInvoices(): Promise<void> {
    if (!qpayConfigured()) return;
    const cutoff = new Date(Date.now() - INVOICE_TTL_MS);
    const stale = await this.payments.find({
      where: { status: PaymentStatus.PENDING, date_created: LessThan(cutoff) },
      take: 100,
    });
    for (const row of stale) {
      try {
        const result = await this.check(row.id);
        if (result.status !== PaymentStatus.PAID) {
          await this.payments.update(
            { id: row.id, status: PaymentStatus.PENDING },
            {
              status: PaymentStatus.EXPIRED,
              note: 'unpaid when the invoice window closed',
            },
          );
        }
      } catch (err) {
        // Leave it PENDING — the next sweep retries. Retiring an invoice
        // because QPay was briefly unreachable would strand a real payment.
        this.logger.warn(
          `Sweep could not resolve ${row.id}: ${(err as Error)?.message}`,
        );
      }
    }
    if (stale.length) this.logger.log(`Swept ${stale.length} stale invoice(s)`);
  }

  /**
   * Receipt for a settled payment.
   *
   * Only reaches accounts with an address on file — signup is phone-based, so
   * most have none and get the in-app history at `GET /payments/mine` instead.
   * A receipt is the one thing a business buyer will actually ask for, which is
   * most of why having an email channel at all is worth it.
   */
  private async emailReceipt(paymentId: string): Promise<void> {
    if (!mailerConfigured()) return;
    const payment = await this.payments.findOne({
      where: { id: paymentId },
      relations: ['user', 'post'],
    });
    if (!payment?.user?.id) return;
    const user = await this.users.findOne({ where: { id: payment.user.id } });
    if (!user?.email) return;

    const featured = payment.kind === PaymentKind.FEATURED;
    const post = featured && payment.post
      ? await this.posts.findOne({ where: { id: payment.post.id } })
      : null;

    await sendMail({
      to: user.email,
      subject: `ZuuchMap — төлбөр баталгаажлаа (${payment.reference ?? payment.id.slice(0, 8)})`,
      text: [
        'Төлбөр амжилттай хийгдлээ.',
        '',
        featured ? 'Үйлчилгээ: Онцлох байршуулалт' : `Багц:     ${payment.plan}`,
        featured
          ? `Зар:      ${post?.title ?? `#${payment.post?.id ?? ''}`}`
          : '',
        featured
          ? `Хугацаа:  ${payment.days} хоног`
          : `Хугацаа:  ${payment.months} сар`,
        `Дүн:      ${payment.amount.toLocaleString('mn-MN')}₮`,
        `Лавлагаа: ${payment.reference ?? payment.id}`,
        featured
          ? post?.featured_until
            ? `Дуусах:   ${new Date(post.featured_until).toISOString().slice(0, 10)}`
            : ''
          : user.plan_expires_at
            ? `Дуусах:   ${new Date(user.plan_expires_at).toISOString().slice(0, 10)}`
            : '',
        '',
        'zuuchmap.com',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  private publicEngineUrl(): string {
    return (process.env.PUBLIC_ENGINE_URL || 'https://zuuchmap.com').replace(
      /\/+$/,
      '',
    );
  }
}
