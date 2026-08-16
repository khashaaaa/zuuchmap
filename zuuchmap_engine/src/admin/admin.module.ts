import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([Post, User]), EventsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
