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
import { Review } from '../../review/entities/review.entity';

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

  /**
   * Exactly one of `post` / `review` is set when filed. Both are SET NULL on
   * delete: deleting what was reported must not delete the report, or an
   * owner could clear the queue and their record by deleting the listing.
   */
  @ManyToOne(() => Post, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  @Index()
  post: Post | null;

  @ManyToOne(() => Review, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  @Index()
  review: Review | null;

  /** POST | REVIEW — which of the two, even after it has been deleted. */
  @Column({ default: 'POST' })
  kind: string;

  /** Who the complaint is against — the post owner or the review's author. */
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  @Index()
  owner: User | null;

  /** The post title or review text as filed, so the queue still reads after a delete. */
  @Column({ type: 'text', nullable: true })
  subject: string | null;

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
