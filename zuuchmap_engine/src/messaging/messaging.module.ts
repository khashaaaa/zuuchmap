import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { EventsModule } from '../events/events.module';
import { PostModule } from '../post/post.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Post, User]),
    EventsModule,
    PostModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
