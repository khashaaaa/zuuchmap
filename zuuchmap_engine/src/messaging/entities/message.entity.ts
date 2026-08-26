import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Conversation } from './conversation.entity';

@Entity('message')
@Index(['conversation', 'date_created'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn()
  conversation: Conversation;

  /** Nullable: a deleted account leaves its side of the conversation readable. */
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  @Index()
  sender: User | null;

  @Column({ type: 'text' })
  body: string;

  /** When the recipient opened the thread. Null while unread. */
  @Column({ type: 'timestamp', nullable: true })
  read_at: Date | null;

  @CreateDateColumn()
  date_created: Date;
}
