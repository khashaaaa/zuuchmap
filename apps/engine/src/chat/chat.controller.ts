import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { MESSAGE_MAX_LENGTH, type Conversation, type ConversationOpenResponse, type Message, type ConversationOpenRequest, type MessageSendRequest } from '@zuuchmap/core';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { ChatService } from './chat.service';

class OpenConversationDto implements ConversationOpenRequest {
  @IsInt() @Min(1) post_id!: number;
  @IsOptional() @IsString() @MaxLength(MESSAGE_MAX_LENGTH) body?: string;
}

class SendMessageDto implements MessageSendRequest {
  @IsString() @MaxLength(MESSAGE_MAX_LENGTH) body!: string;
}

class InboxQueryDto {
  @IsOptional() @IsISO8601() before?: string;
}

class MessagesQueryDto {
  @IsOptional() @IsISO8601() before?: string;
  @IsOptional() @IsUUID() before_id?: string;
}

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(@CurrentUser() me: RequestUser, @Query() q: InboxQueryDto): Promise<Conversation[]> {
    return this.chat.list(me, q.before);
  }

  @Post()
  @HttpCode(200)
  open(@CurrentUser() me: RequestUser, @Body() body: OpenConversationDto): Promise<ConversationOpenResponse> {
    return this.chat.open(me, body.post_id, body.body);
  }

  @Get(':id')
  get(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<Conversation> {
    return this.chat.get(me, id);
  }

  @Get(':id/messages')
  messages(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: MessagesQueryDto): Promise<Message[]> {
    return this.chat.messages(me, id, q.before, q.before_id);
  }

  @Post(':id/messages')
  @HttpCode(201)
  send(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: SendMessageDto): Promise<Message> {
    return this.chat.send(me, id, body.body);
  }

  @Put(':id/read')
  read(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    return this.chat.read(me, id);
  }
}
