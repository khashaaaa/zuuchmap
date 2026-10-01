import { User } from '../../user/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique(['user_id', 'post_type', 'post_id'])
@Index(['user_id'])
@Index(['post_type', 'post_id'])
export class Viewedpost {
  @PrimaryGeneratedColumn()
  id: number;

  // Nullable since anonymous views started counting: an anonymous row is
  // keyed by `visitor_key` instead. Postgres treats NULLs as distinct in a
  // UNIQUE constraint, so those rows simply never collide on the tuple above.
  @Column({ nullable: true, type: 'varchar' })
  user_id: string | null;

  /**
   * Hashed, salted, non-identifying key for the viewer's device — see
   * `utils/visitor.ts`. Set on signed-in rows too when the client sent one, so
   * the same device is one viewer either side of signing in.
   */
  @Column({ nullable: true, type: 'varchar', length: 64 })
  visitor_key: string | null;

  /** Hashed connecting address, anonymous rows only — caps them per source. */
  @Column({ nullable: true, type: 'varchar', length: 32 })
  ip_key: string | null;

  @Column()
  post_type: string;

  @Column()
  post_id: number;

  @CreateDateColumn()
  date_viewed: Date;

  @ManyToOne(() => User, (user) => user.viewedposts, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}
