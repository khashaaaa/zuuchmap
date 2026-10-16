import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** One row per viewer per listing, ever. Owner/admin rows are kept with counted=false. */
@Entity('post_views')
export class PostView {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  post_id!: number;

  @Column({ type: 'uuid', nullable: true })
  user_id!: string | null;

  /** Salted hash of X-Visitor-Id (or of address+agent when absent). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  visitor_key!: string | null;

  /** Salted hash of the connecting address; anonymous rows only. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ip_key!: string | null;

  @Column({ type: 'boolean', default: false })
  counted!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  date_viewed!: Date;
}
