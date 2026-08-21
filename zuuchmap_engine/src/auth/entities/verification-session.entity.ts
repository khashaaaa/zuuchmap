import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * One verify.mn Mobile-Originated verification attempt.
 *
 * Persisted rather than cached in memory because the verify.mn callback can
 * land on a different pm2 cluster worker than the one that created the session.
 */
@Entity('verification_session')
@Index(['phone_number', 'status'])
export class VerificationSession {
  /** Our id. Also the callback path segment verify.mn calls back on. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** sessionId returned by verify.mn. Null only for dev-mode sessions. */
  @Index()
  @Column({ nullable: true })
  provider_session_id: string;

  @Index()
  @Column()
  phone_number: string;

  /** The numeric text the user must SMS to the shortcode. Not a secret. */
  @Column()
  code: string;

  /** PENDING → VERIFIED | EXPIRED | CONSUMED */
  @Column({ default: 'PENDING' })
  status: string;

  /** sha256 of the client device id, trusted on success so we never charge twice. */
  @Column({ nullable: true })
  device_hash: string;

  /** Throttles upstream polling — verify.mn 429s a session polled faster than 2s. */
  @Column({ type: 'timestamp', nullable: true })
  last_checked_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  verified_at: Date;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
