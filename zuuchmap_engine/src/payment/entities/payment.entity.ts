import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Post } from '../../post/entities/post.entity';
import { PaymentKind, PaymentProvider, PaymentStatus } from '../../enums/payment';

/**
 * One attempt to buy plan time.
 *
 * A row is written *before* the provider is contacted, so an invoice that QPay
 * accepts but whose callback never arrives is still recoverable — the row is
 * what `GET /payments/mine` polls and what the sweep re-checks. Money that
 * moved with no local record is the failure mode this ordering removes.
 */
@Entity('payment')
@Index(['status'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  @Index()
  user: User;

  /**
   * Which product this invoice is for. Defaults to PLAN so every row written
   * before featured placement was sellable reads correctly.
   */
  @Column({ default: PaymentKind.PLAN })
  @Index()
  kind: string;

  /**
   * The plan this buys, for a PLAN invoice. Stored, not re-derived: prices
   * change, receipts don't. Null on a FEATURED invoice, which buys placement
   * on one post rather than entitlement on the account.
   */
  @Column({ type: 'varchar', nullable: true })
  plan: string | null;

  @Column({ type: 'int', default: 1 })
  months: number;

  /**
   * The post a FEATURED invoice buys placement on.
   *
   * Nullable and `SET NULL` on delete: a receipt outlives the listing it was
   * for. Someone reconciling a bank line a year later needs the row to still
   * exist, and the amount and reference on it are the parts that matter.
   */
  @ManyToOne(() => Post, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  @Index()
  post: Post | null;

  /** Days of placement bought, for a FEATURED invoice. Null on a PLAN one. */
  @Column({ type: 'int', nullable: true })
  days: number | null;

  /** Minor-unit-free: the tögrög has no subunit in circulation. */
  @Column({ type: 'int' })
  amount: number;

  @Column({ default: 'MNT' })
  currency: string;

  @Column({ default: PaymentProvider.QPAY })
  provider: string;

  @Column({ default: PaymentStatus.PENDING })
  status: string;

  /**
   * QPay's id for the invoice. Unique so a duplicated callback cannot create a
   * second row, and nullable because a MANUAL payment never has one.
   */
  @Column({ type: 'varchar', nullable: true, unique: true })
  provider_invoice_id: string | null;

  /** Our own reference, sent as QPay's `sender_invoice_no` — how support ties a bank line back to a row. */
  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paid_at: Date | null;

  /** Set once the plan has actually been granted — the idempotency latch for a repeated callback. */
  @Column({ type: 'timestamp', nullable: true })
  granted_at: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
