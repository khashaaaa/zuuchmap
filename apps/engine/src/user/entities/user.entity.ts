import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** CUSTOMER until the first listing; PROVIDER is set once and never changed back. */
  @Column({ type: 'varchar', length: 16, default: 'CUSTOMER' })
  type!: string;

  /** Stamped by the single conditional update that sets the role. NULL = never chosen. */
  @Column({ type: 'timestamptz', nullable: true })
  role_set_at!: Date | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  phone_number!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  parent_name!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  given_name!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address!: string | null;

  @Column({ type: 'boolean', nullable: true })
  is_verified!: boolean | null;

  @Column({ type: 'varchar', nullable: true })
  profile_picture!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'FREE' })
  plan!: string;

  @Column({ type: 'int', default: 0 })
  posts_rejected!: number;

  @Column({ type: 'timestamptz', nullable: true })
  plan_expires_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  date_created!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  date_updated!: Date;
}
