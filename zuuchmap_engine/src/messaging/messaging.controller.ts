import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagingService } from './messaging.service';
import { OpenConversationDto, SendMessageDto } from './dto/messaging.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@Req() req) {
    return this.messaging.list(req.user.id);
  }

  /** Drives the inbox badge; polled on focus, so it stays a single cheap read. */
  @Get('unread-count')
  unreadCount(@Req() req) {
    return this.messaging.unreadCount(req.user.id);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  open(@Body() dto: OpenConversationDto, @Req() req) {
    return this.messaging.open(req.user.id, dto.post_id, dto.body);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    return this.messaging.detail(id, req.user.id);
  }

  @Get(':id/messages')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req,
    @Query('before') before?: string,
  ) {
    return this.messaging.history(id, req.user.id, before);
  }

  /**
   * Sending is rate-limited per user (the throttler keys on the JWT subject),
   * so this bounds one account's ability to flood another's inbox — the reason
   * a chat feature needs a limit that a read endpoint does not.
   */
  @Post(':id/messages')
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() req,
  ) {
    return this.messaging.send(req.user.id, id, dto.body);
  }

  @Put(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    return this.messaging.markRead(id, req.user.id);
  }
}
