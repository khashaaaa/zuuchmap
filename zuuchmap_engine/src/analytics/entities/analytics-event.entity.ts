import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

/**
 * First-party behavioural event. Deliberately narrow: no IP, no user agent,
 * no cross-site identifier — an `anon_id` the client generates and keeps in
 * local storage is enough to count uniques and stitch a funnel.
 */
@Entity('analytics_event')
@Index(['name', 'occurred_at'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** Dotted event name, e.g. "post.create.submitted". */
  @Column()
  name: string;

  /** Random client-generated id. Not tied to identity until the user signs in. */
  @Index()
  @Column({ nullable: true })
  anon_id: string;

  @Column({ nullable: true })
  path: string;

  @Column({ nullable: true })
  referrer: string;

  /** "web" | "ios" | "android" */
  @Column({ nullable: true })
  platform: string;

  @Column({ type: 'jsonb', nullable: true })
  props: Record<string, unknown>;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  @Index()
  user: User;

  @Index()
  @Column({ type: 'timestamp', default: () => 'now()' })
  occurred_at: Date;
}
