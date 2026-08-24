import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn, Index,
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

@Entity('post')
@Index(['category'])
@Index(['subcategory'])
@Index(['status'])
@Index(['approval_status'])
@Index(['category', 'approval_status'])
@Index(['approval_status', 'date_created'])
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

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
