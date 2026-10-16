import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { PostModule } from '../post/post.module';
import { NotificationCronService } from './notification-cron.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { LiveNotifyTransports, NOTIFY_TRANSPORTS } from './transports';

@Module({
  imports: [PostModule, ChatModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationCronService, { provide: NOTIFY_TRANSPORTS, useClass: LiveNotifyTransports }],
  exports: [NotificationService],
})
export class NotificationModule {}
