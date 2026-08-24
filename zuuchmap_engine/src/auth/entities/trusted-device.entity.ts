import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

/**
 * A device that has already proven possession of the account's phone number.
 *
 * Verification costs the end user 150₮ per SMS, so we charge them once per
 * device: a known device re-authenticates against the stored JWT alone.
 */
@Entity('trusted_device')
@Unique(['user', 'device_hash'])
export class TrustedDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  @Index()
  user: User;

  /** sha256(device_id) — the raw client id never touches our storage. */
  @Index()
  @Column()
  device_hash: string;

  @Column({ type: 'timestamp', nullable: true })
  last_seen_at: Date;

  @CreateDateColumn()
  date_created: Date;
}
