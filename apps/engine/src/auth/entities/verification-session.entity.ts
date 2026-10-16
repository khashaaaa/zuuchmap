import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type SessionStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'CONSUMED';

/** One verify.mn attempt. Persisted so a callback landing on another instance still finds it. */
@Entity('verification_session')
@Index(['phone_number', 'status'])
export class VerificationSession {
  /** Our id; also the callback path segment verify.mn calls. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** verify.mn's session id. NULL only for fake dev-mode sessions. */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  provider_session_id!: string | null;

  @Column({ type: 'varchar', length: 16 })
  phone_number!: string;

  /** The numeric text the user sends to the shortcode. Not a secret. */
  @Column({ type: 'varchar', length: 16 })
  code!: string;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: SessionStatus;

  /** sha256 of the client's device id; becomes a trusted device on success. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  device_hash!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_checked_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  verified_at!: Date | null;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  date_created!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  date_updated!: Date;
}
