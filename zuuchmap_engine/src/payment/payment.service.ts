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
import { PlanService } from '../user/plan.service';
import { Plan } from '../enums/plan';
import { PaymentProvider, PaymentStatus } from '../enums/payment';
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

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly plans: PlanService,
    private readonly dataSource: DataSource,
  ) {}

  /** What a client renders on the upgrade screen. Safe to call anonymously. */
  catalogue() {
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
    };
  }

  /**
   * Open an invoice for `months` of `plan`.
   *
   * The row is written before QPay is called, so a request that dies between
   * "invoice created upstream" and "response reached us" leaves a PENDING row
   * the sweep can still settle. The reverse ordering loses money silently.
   */
  async createInvoice(
    userId: string,
    plan: string,
    months: number,
  ): Promise<{
    payment_id: string;
    amount: number;
    currency: string;
    months: number;
    plan: string;
    qr_text: string;
    qr_image: string;
    urls: QPayInvoice['urls'];
  }> {
    if (!qpayConfigured())
      throw new ServiceUnavailableException('PAYMENTS_NOT_CONFIGURED');
    if (plan !== Plan.PROVIDER)
      throw new BadRequestException('PLAN_NOT_PURCHASABLE');

    const clampedMonths = Math.min(
      Math.max(Math.floor(months) || 1, 1),
      MAX_MONTHS,
    );
    const unit = monthlyPriceMnt(plan);
    if (unit <= 0) throw new ServiceUnavailableException('PLAN_PRICE_NOT_SET');

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Abandoning a QR and opening another is normal behaviour; leaving the old
    // one settleable is not — it would grant a second month for one payment.
    await this.payments.update(
      { user: { id: userId }, status: PaymentStatus.PENDING },
      {
        status: PaymentStatus.CANCELLED,
        note: 'superseded by a newer invoice',
      },
    );

    const amount = unit * clampedMonths;
    const payment = await this.payments.save(
      this.payments.create({
        user,
        plan,
        months: clampedMonths,
        amount,
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
        description: `Zuuchmap ${plan} — ${clampedMonths} сар`,
        amount,
        callbackUrl: `${this.publicEngineUrl()}/engine/payments/callback/${payment.id}`,
      });

      payment.provider_invoice_id = invoice.invoice_id;
      payment.reference = reference;
      await this.payments.save(payment);

      return {
        payment_id: payment.id,
        amount,
        currency: 'MNT',
        months: clampedMonths,
        plan,
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

  /**
   * Ask the provider whether an invoice settled, and grant the plan if it did.
   *
   * Every path that could grant a plan funnels through here, because this is
   * the only function that talks to QPay about money. `userId`, when given,
   * scopes the lookup so one provider cannot poll another's invoice.
   */
  async check(
    paymentId: string,
    userId?: string,
  ): Promise<{ status: string; plan?: string; plan_expires_at?: Date | null }> {
    const where: Record<string, unknown> = { id: paymentId };
    if (userId) where.user = { id: userId };
    const payment = await this.payments.findOne({
      where: where,
      relations: ['user'],
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status === PaymentStatus.PAID) {
      const user = await this.users.findOne({ where: { id: payment.user.id } });
      return {
        status: PaymentStatus.PAID,
        plan: user?.plan,
        plan_expires_at: user?.plan_expires_at ?? null,
      };
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
  private async settle(
    paymentId: string,
  ): Promise<{ status: string; plan?: string; plan_expires_at?: Date | null }> {
    const granted = await this.dataSource.transaction(async (em) => {
      const row = await em.findOne(Payment, {
        where: { id: paymentId },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Payment not found');
      if (row.granted_at) return null; // already settled by the other caller

      row.status = PaymentStatus.PAID;
      row.paid_at = row.paid_at ?? new Date();
      row.granted_at = new Date();
      await em.save(row);
      return { userId: row.user.id, plan: row.plan, months: row.months };
    });

    const userId =
      granted?.userId ??
      (
        await this.payments.findOne({
          where: { id: paymentId },
          relations: ['user'],
        })
      )?.user.id;

    if (granted) {
      const result = await this.plans.setPlan(
        granted.userId,
        granted.plan,
        granted.months,
      );
      this.logger.log(
        `Payment ${paymentId} settled → ${granted.plan} x${granted.months} for ${granted.userId}`,
      );
      // Fire-and-forget: a receipt that fails to send must never unwind a plan
      // the provider has already paid for.
      void this.emailReceipt(paymentId).catch(() => undefined);
      return { status: PaymentStatus.PAID, ...result };
    }

    const user = userId
      ? await this.users.findOne({ where: { id: userId } })
      : null;
    return {
      status: PaymentStatus.PAID,
      plan: user?.plan,
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
      take: 50,
    });
    return rows.map((p) => ({
      id: p.id,
      plan: p.plan,
      months: p.months,
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
      relations: ['user'],
    });
    if (!payment?.user?.id) return;
    const user = await this.users.findOne({ where: { id: payment.user.id } });
    if (!user?.email) return;

    await sendMail({
      to: user.email,
      subject: `ZuuchMap — төлбөр баталгаажлаа (${payment.reference ?? payment.id.slice(0, 8)})`,
      text: [
        'Төлбөр амжилттай хийгдлээ.',
        '',
        `Багц:     ${payment.plan}`,
        `Хугацаа:  ${payment.months} сар`,
        `Дүн:      ${payment.amount.toLocaleString('mn-MN')}₮`,
        `Лавлагаа: ${payment.reference ?? payment.id}`,
        user.plan_expires_at
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
