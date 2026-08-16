import { User } from "../../user/entities/user.entity";
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity()
@Unique(['user_id', 'post_type', 'post_id'])
@Index(['user_id'])
@Index(['post_type', 'post_id'])
export class Viewedpost {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    user_id: string;

    @Column()
    post_type: string;

    @Column()
    post_id: number;

    @CreateDateColumn()
    date_viewed: Date;

    @ManyToOne(() => User, (user) => user.viewedposts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;
}

