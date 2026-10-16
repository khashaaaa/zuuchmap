import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ListingRevision, PostSnapshot } from '@zuuchmap/core';

/**
 * A listing. The table also has a generated `geo` geography(Point,4326) column (GiST) and a
 * generated `search_vector`; both are intentionally unmapped and read through raw SQL.
 */
@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'uuid', nullable: true })
  user_id!: string | null;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'varchar', nullable: true })
  subcategory!: string | null;

  @Column({ type: 'varchar', nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @Column({ type: 'varchar', nullable: true })
  province!: string | null;

  @Column({ type: 'varchar', nullable: true })
  district!: string | null;

  @Column({ type: 'varchar', nullable: true })
  address!: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  /** numeric(15,2): a string from pg. */
  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  price_amount!: string | null;

  @Column({ type: 'varchar', nullable: true })
  price_unit!: string | null;

  @Column({ type: 'varchar', nullable: true })
  contact_phone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  contact_email!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  available_from!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  available_until!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  website!: string | null;

  /** Storage keys only, never URLs. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  images!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  attributes!: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  views!: number;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  approval_status!: string;

  /** Saved but not submitted: no moderation, no quota, never in browse. */
  @Column({ type: 'boolean', default: false })
  is_draft!: boolean;

  /** On an APPROVED listing this means the *edit* was refused. */
  @Column({ type: 'text', nullable: true })
  rejection_reason!: string | null;

  /** Wizard field the client should open on. */
  @Column({ type: 'varchar', nullable: true })
  rejection_field!: string | null;

  /** The live version before an approved-edit flow, so the client can show what changed. */
  @Column({ type: 'jsonb', nullable: true })
  previous_snapshot!: PostSnapshot | null;

  /** An edit parked beside a live listing; only ever set on an APPROVED row. */
  @Column({ type: 'jsonb', nullable: true })
  pending_revision!: ListingRevision | null;

  @Column({ type: 'timestamptz', nullable: true })
  expires_at!: Date | null;

  /** Set when the 3-day warning went out; cleared when the window moves. */
  @Column({ type: 'timestamptz', nullable: true })
  expiry_warned_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  featured_until!: Date | null;

  @Column({ type: 'boolean', default: false })
  is_featured!: boolean;

  /** When the listing first went live (approve); null while never approved. */
  @Column({ type: 'timestamptz', nullable: true })
  published_at!: Date | null;

  /** Soft delete. */
  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  date_created!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  date_updated!: Date;
}
