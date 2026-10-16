import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { PostModule } from '../post/post.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [PostModule, PeopleModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
