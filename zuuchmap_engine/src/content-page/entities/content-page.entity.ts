import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ContentPageType = 'PRIVACY' | 'TERMS' | 'ACCOUNT_DELETION';

@Entity('content_page')
export class ContentPage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  type: ContentPageType;

  @Column({ type: 'json' })
  content: any;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
