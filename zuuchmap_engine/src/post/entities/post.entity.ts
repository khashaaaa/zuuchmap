import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export interface PostSnapshot {
  title: string | null;
  details: string | null;
  price: number | null;
  price_unit: string | null;
  attributes: Record<string, any> | null;
  images: string[];
  subcategory: string | null;
  province: string | null;
  district: string | null;
}

/**
 * A content edit an owner has submitted for an APPROVED post, held aside while
 * it waits for moderation.
 *
 * The post row itself keeps serving the version an admin already approved, so
 * browse never loses a live listing because its owner corrected a price. On
 * approve the revision is written onto the row; on reject it is discarded and
 * the live version simply stays. Every field an edit may touch is carried here
 * — anything omitted would silently revert on approval.
 */
export interface PostRevision {
  title: string | null;
  details: string | null;
  subcategory: string | null;
  province: string | null;
  district: string | null;
  address: string | null;
  location: string | null;
  price_unit: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  price_amount: number | null;
  attributes: Record<string, any> | null;
  images: string[];
  /** ISO timestamp, so the moderation queue can order revisions FIFO too. */
  submitted_at: string;
}

@Entity('post')
// Single-column indexes on `category` and `approval_status` used to sit here.
// Both were strict prefixes of the composites below, so they cost writes and
// bought no reads — see FeaturedRankIndex for the measurements.
@Index(['subcategory'])
@Index(['status'])
@Index(['category', 'approval_status'])
@Index(['approval_status', 'date_created'])
// Serves the default browse: equality on approval_status, then both sort keys.
@Index('IDX_post_browse_order', [
  'approval_status',
  'is_featured',
  'date_created',
])
@Index(['user'])
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  category: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  user: User;

  @Column({ nullable: true })
  subcategory: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true, type: 'text' })
  details: string;

  @Column({ nullable: true })
  province: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true, type: 'float' })
  latitude: number;

  @Column({ nullable: true, type: 'float' })
  longitude: number;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true, type: 'decimal', precision: 15, scale: 2 })
  price_amount: number;

  @Column({ nullable: true })
  price_unit: string;

  @Column({ nullable: true })
  contact_phone: string;

  @Column({ nullable: true })
  contact_email: string;

  @Column({ nullable: true, type: 'timestamp' })
  available_from: Date;

  @Column({ nullable: true, type: 'timestamp' })
  available_until: Date;

  @Column({ nullable: true })
  website: string;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  images: string[];

  @Column({ type: 'jsonb', nullable: true, default: {} })
  attributes: Record<string, any>;

  // The DB also has a generated `search_vector` tsvector column (see CategoryScaling
  // migration). It is intentionally unmapped — findAll references it via raw SQL.

  @Column({ default: 0 })
  views: number;

  @Column({ nullable: true, default: 'ACTIVE' })
  status: string;

  @Column({ nullable: true, default: 'PENDING' })
  approval_status: string;

  @Column({ nullable: true, type: 'text' })
  rejection_reason: string;

  // Which form field the rejection is about: a `FieldDef.key` from the category
  // schema or one of the base fields (title, details, price, images, location).
  // Cleared on approve, and on the owner's next content edit alongside the reason.
  @Column({ nullable: true, type: 'varchar' })
  rejection_field: string | null;

  // The APPROVED version a post looked like before its owner edited it back into
  // moderation, so the admin can review a diff rather than re-read the whole
  // thing. Taken once per moderation round (first edit wins) and cleared by
  // approve/reject.
  @Column({ type: 'jsonb', nullable: true })
  previous_snapshot: PostSnapshot | null;

  /**
   * A content edit awaiting moderation on a post that is still live.
   *
   * Non-null means "this post is APPROVED and visible with its current
   * content, and its owner has proposed different content". The moderation
   * queue picks these up alongside never-approved posts; approve applies it,
   * reject discards it. Only ever set on an APPROVED post — a PENDING or
   * REJECTED one has no live version to protect, so its edits are written
   * straight to the row.
   */
  @Index('IDX_post_pending_revision', { where: '"pending_revision" IS NOT NULL' })
  @Column({ type: 'jsonb', nullable: true })
  pending_revision: PostRevision | null;

  // Derived, never stored: ISO dates (next 14 days) blocked by ACCEPTED
  // bookings. Attached by `PostService.attachBusyDates` for rental categories.
  busy_dates?: string[];

  @Column({ nullable: true, type: 'timestamp' })
  expires_at: Date;

  // Paid placement window. NULL or past = ordinary post. Never affects whether
  // a post is *visible* — only its position in the default sort.
  @Index()
  @Column({ nullable: true, type: 'timestamp' })
  featured_until: Date | null;

  /**
   * `featured_until > NOW()`, materialised so the browse can be ordered by an
   * indexable column instead of a NOW()-dependent CASE. Written with
   * featured_until and refreshed by an hourly sweep; ranking only, never
   * visibility. The badge still reads featured_until, which is exact.
   */
  @Column({ type: 'boolean', default: false })
  is_featured: boolean;

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
