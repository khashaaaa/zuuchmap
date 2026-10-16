import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { FieldDef, LocalizedLabels, SubcategoryDef } from './category.types';

@Entity('category_schema')
export class CategorySchema {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', unique: true })
  key!: string;

  /** One of the four family keys (core FAMILIES). */
  @Index('IDX_category_schema_family')
  @Column({ type: 'varchar' })
  family!: string;

  /** Mongolian label; `labels` carries all four locales. */
  @Column({ type: 'varchar' })
  label!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  labels!: LocalizedLabels;

  /** Lucide name; validated against the shipped whitelist on write, family icon on read when unknown. */
  @Column({ type: 'varchar', nullable: true })
  icon!: string | null;

  @Column({ type: 'varchar', nullable: true })
  color!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  subcategories!: SubcategoryDef[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  fields!: FieldDef[];

  @Column({ type: 'boolean', default: false })
  has_rental_status!: boolean;

  @Column({ type: 'boolean', default: false })
  has_availability_dates!: boolean;

  @Column({ type: 'boolean', default: false })
  has_price!: boolean;

  @Column({ type: 'varchar', nullable: true })
  default_price_unit!: string | null;

  @Column({ type: 'boolean', default: false })
  emphasized!: boolean;

  /** Primary action Book. */
  @Column({ type: 'boolean', default: false })
  rentable!: boolean;

  /** Pinned with call-now. */
  @Column({ type: 'boolean', default: false })
  sos!: boolean;

  @Column({ type: 'int', nullable: true })
  post_expiry_days!: number | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
