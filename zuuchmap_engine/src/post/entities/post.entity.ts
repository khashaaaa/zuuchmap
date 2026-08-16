import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

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

  @Column({ nullable: true, type: 'timestamp' })
  expires_at: Date;

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
