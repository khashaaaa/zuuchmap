import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Post } from '../../post/entities/post.entity';
import { User } from '../../user/entities/user.entity';

@Entity('booking')
@Index(['status'])
export class Booking {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn()
  @Index()
  post: Post;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  @Index()
  customer: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  @Index()
  provider: User;

  @Column({ type: 'timestamp' })
  start_date: Date;

  @Column({ type: 'timestamp' })
  end_date: Date;

  @Column({ nullable: true, type: 'text' })
  message: string;

  // PENDING → ACCEPTED | DECLINED; PENDING/ACCEPTED → CANCELLED (by customer);
  // PENDING → EXPIRED (nightly sweep, once the requested dates have passed)
  @Column({ default: 'PENDING' })
  status: string;

  @Column({ nullable: true, type: 'text' })
  response_message: string;

  // When the provider answered — accept or decline. Its own column because
  // date_updated is bumped by any later write (the review-prompt sweep, for
  // one), which made it useless as a proxy for the response.
  @Column({ nullable: true, type: 'timestamp' })
  responded_at: Date | null;

  // Set by the nightly review-prompt sweep once the customer has been nudged.
  @Column({ nullable: true, type: 'timestamp' })
  review_prompted_at: Date | null;

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
