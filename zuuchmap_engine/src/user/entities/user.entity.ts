import { Column, CreateDateColumn, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn } from "typeorm";
import { Company } from "../../company/entities/company.entity";
import { UserType } from "../../enums/usertype";
import { Post } from "../../post/entities/post.entity";
import { Likedpost } from "../../likedpost/entities/likedpost.entity";
import { Viewedpost } from "../../viewedpost/entities/viewedpost.entity";

@Entity()
export class User {

    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({
        type: 'enum',
        enum: UserType,
        nullable: true
    })
    type: string

    @Index()
    @Column({ nullable: true })
    phone_number: string

    @Column({ nullable: true })
    parent_name: string

    @Column({ nullable: true })
    given_name: string

    @Index()
    @Column({ nullable: true })
    email: string

    @Column({ nullable: true })
    address: string

    @Column({ nullable: true })
    biometric: string

    @Column({ type: 'jsonb', nullable: true })
    device_info: string

    @Column({ nullable: true })
    is_verified: boolean

    @Column({ nullable: true })
    profile_picture: string

    @Column({ nullable: true })
    push_token: string

    @ManyToOne(() => Company, company => company.users)
    @JoinColumn()
    company: Company

    @OneToMany(() => Post, post => post.user)
    posts: Post[]

    @OneToMany(() => Likedpost, likepost => likepost.user)
    likedposts: Likedpost[]

    @OneToMany(() => Viewedpost, viewedpost => viewedpost.user)
    viewedposts: Viewedpost[]

    @CreateDateColumn()
    date_created: Date

    @UpdateDateColumn()
    date_updated: Date
}
