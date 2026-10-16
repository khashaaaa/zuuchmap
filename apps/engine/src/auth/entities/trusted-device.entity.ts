import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** A device that already proved possession of the number: it skips the paid text for a year. */
@Entity('trusted_device')
@Unique(['user_id', 'device_hash'])
export class TrustedDevice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id!: string;

  /** sha256(device_id): the raw client id never reaches storage. */
  @Column({ type: 'varchar', length: 64 })
  device_hash!: string;

  @Column({ type: 'timestamptz' })
  last_seen_at!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  date_created!: Date;
}
