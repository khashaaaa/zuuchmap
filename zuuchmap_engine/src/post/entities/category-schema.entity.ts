import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface FieldDef {
  key: string;
  label: string;
  labels?: Record<string, string>;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'date'
    | 'phone'
    // Stores a real JSON boolean. Filtered by jsonb containment.
    | 'boolean'
    // Stores a JSON array of `options` values. Filtered by the `?` operator.
    | 'multiselect';
  options?: string[];
  required?: boolean;
  // Required fields render upfront; 'details' fields sit behind a collapsible.
  // Omitted means 'core'.
  group?: 'core' | 'details';
  placeholder?: string;
  // Localized placeholder, mirrors `labels`. Falls back to `placeholder`.
  placeholders?: Record<string, string>;
  filterable?: boolean;
  // Rendered as a suffix on the field label and on the post detail row.
  unit?: string;
}

@Entity('category_schema')
export class CategorySchema {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  labels: Record<string, string>;

  @Column({ nullable: true })
  icon: string;

  @Column({ nullable: true })
  color: string;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  subcategories: Array<{
    value: string;
    display: string;
    labels?: Record<string, string>;
  }>;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  fields: FieldDef[];

  // Behavior flags — clients derive per-category UI from these, never from hardcoded lists
  @Column({ default: false })
  has_rental_status: boolean;

  @Column({ default: false })
  has_availability_dates: boolean;

  @Column({ default: false })
  has_price: boolean;

  @Column({ nullable: true })
  default_price_unit: string;

  // Clients render posts of this category with an attention-drawing card style
  @Column({ default: false })
  emphasized: boolean;

  // Days until a new post expires; null falls back to the system default (30)
  @Column({ type: 'int', nullable: true })
  post_expiry_days: number | null;

  @Column({ default: true })
  active: boolean;

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;
}
