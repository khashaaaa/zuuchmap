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
 * One thread between a customer and a provider, about one listing.
 *
 * Until now the entire negotiation happened over a phone number revealed after
 * a booking was accepted, which meant the platform had no record of what was
 * agreed — nothing to show when the two disagree, no way to see whether a
 * listing actually converts, and no contact at all before a booking exists.
 *
 * Scoped to a post rather than to a pair of people: the same customer asking
 * about an excavator and about a truck is asking two different questions, and
 * merging them into one thread loses which listing is being discussed.
 *
 * Unread counts are denormalised onto the row because the inbox badge is read
 * on every screen and counting messages for it would be a query per thread.
 */
@Entity('conversation')
@Index(['customer', 'last_message_at'])
@Index(['provider', 'last_message_at'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nullable so a thread survives its listing being deleted or expiring out. */
  @ManyToOne(() => Post, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  @Index()
  post: Post | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  customer: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  provider: User;

  /** Sort key for the inbox. Set on every send, so it never needs a join to order. */
  @Column({ type: 'timestamp', nullable: true })
  @Index()
  last_message_at: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  last_message_preview: string | null;

  @Column({ type: 'int', default: 0 })
  customer_unread: number;

  @Column({ type: 'int', default: 0 })
  provider_unread: number;

  @CreateDateColumn()
  date_created: Date;

  @UpdateDateColumn()
  date_updated: Date;
}
