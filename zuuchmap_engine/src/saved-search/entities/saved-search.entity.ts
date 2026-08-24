import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A browse filter the user asked to be told about. Columns mirror the
 * `GET /posts` query params one-to-one so a saved search can be replayed
 * verbatim by the client and matched server-side on approval.
 */
@Entity('saved_search')
export class SavedSearch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  category: string | null;

  @Column({ nullable: true, type: 'varchar' })
  subcategory: string | null;

  @Column({ nullable: true, type: 'varchar' })
  province: string | null;

  @Column({ nullable: true, type: 'varchar' })
  district: string | null;

  @Column({ nullable: true, type: 'varchar' })
  q: string | null;

  /** `{ "attr.<key>": value }` exactly as sent to `/posts` (incl. `_min`/`_max`). */
  @Column({ type: 'jsonb', nullable: true, default: {} })
  attrs: Record<string, any> | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true, type: 'timestamp' })
  last_notified_at: Date | null;
}
