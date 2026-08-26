import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * One row per device an account can be pushed to.
 *
 * This replaced a single `user.push_token` column, which could only ever hold
 * the most recently registered device. Two things went wrong with that: signing
 * in on a second device silently stopped the first one receiving anything, and
 * signing *out* on either one cleared the column for the whole account — so a
 * device still logged in went quiet with no way to notice.
 *
 * The token is globally unique rather than unique per user: an Expo token
 * identifies a physical install, so when a device changes hands between accounts
 * the row moves with it instead of leaving the previous owner able to push to
 * someone else's phone.
 */
@Entity('push_device')
@Index(['user'])
export class PushDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn()
  user: User;

  /**
   * Expo: the ExponentPushToken. Web: the subscription's endpoint URL, which
   * the Push API already guarantees is unique per browser install — so one
   * unique column keeps identifying one place to deliver to, whichever
   * transport that place speaks.
   */
  @Index({ unique: true })
  @Column()
  token: string;

  /**
   * 'EXPO' | 'WEB'. Providers who work from the website were unreachable
   * entirely: notifications were Expo push plus an in-app socket, so closing
   * the tab meant missing every booking request and every approval.
   */
  @Column({ default: 'EXPO' })
  provider: string;

  /** VAPID keying material for a WEB row (`{ keys: { p256dh, auth } }`). Null for Expo. */
  @Column({ type: 'jsonb', nullable: true })
  web_subscription: Record<string, any> | null;

  /** 'ios' | 'android' — informational, for diagnosing delivery per platform. */
  // Explicit type: a `string | null` property emits `Object` as its design type,
  // which TypeORM cannot map to a Postgres column on its own.
  @Column({ type: 'varchar', nullable: true })
  platform: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  last_seen_at: Date;

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
