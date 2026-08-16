import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export interface FieldDef {
  key: string;
  label: string;
  labels?: Record<string, string>;
  type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'phone';
  options?: string[];
  required?: boolean;
  placeholder?: string;
  filterable?: boolean;
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
  subcategories: Array<{ value: string; display: string; labels?: Record<string, string> }>;

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

  @Column({ default: true })
  active: boolean;

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;
}
