import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Post } from '../../post/entities/post.entity';

/**
 * A user flagging something that is already live.
 *
 * Moderation up to now was purely pre-approval: an admin sees a post once, and
 * anything that goes wrong afterwards — a rental that no longer exists, a
 * phone number that turns out to be a scam, a price edited into a bait — is
 * invisible until the admin happens to look. This is the channel back.
 */
@Entity('report')
@Index(['status'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nullable: the reporter's account can be deleted without erasing the report. */
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  @Index()
  reporter: User | null;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn()
  @Index()
  post: Post;

  /** One of REPORT_REASONS — a closed list so the queue can be triaged by kind. */
  @Column()
  reason: string;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  /** OPEN → RESOLVED | DISMISSED. */
  @Column({ default: 'OPEN' })
  status: string;

  /** What the admin did about it — kept for the next admin who sees the provider. */
  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
