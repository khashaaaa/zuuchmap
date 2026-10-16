import { Body, Controller, Delete, Get, HttpCode, Param, Put, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsISO8601, IsNumberString, IsOptional, IsString, Matches, MaxLength, ValidateNested,
} from 'class-validator';
import { LOCALES, type AppNotification, type Badges, type Locale, type NotificationSettings, type OkResponse, type PushProvider, type VapidKeyResponse, type NotificationsReadRequest, type PushDeviceRemoveRequest, type PushDeviceRequest } from '@zuuchmap/core';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { ChatService } from '../chat/chat.service';
import { PostService } from '../post/post.service';
import { NotificationService } from './notification.service';

class ListQueryDto {
  @IsOptional() @IsISO8601() before?: string;
  @IsOptional() @IsNumberString() before_id?: string;
}

class ReadDto implements NotificationsReadRequest {
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsNumberString({}, { each: true }) ids?: string[];
}

class TopicsDto {
  @IsOptional() @IsBoolean() chat?: boolean;
  @IsOptional() @IsBoolean() booking?: boolean;
  @IsOptional() @IsBoolean() saved_search?: boolean;
  @IsOptional() @IsBoolean() news?: boolean;
}

class SettingsDto {
  @IsOptional() @ValidateNested() @Type(() => TopicsDto) topics?: TopicsDto;
  @IsOptional() @IsIn(LOCALES) locale?: Locale;
}

class KeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}

class DeviceDto implements PushDeviceRequest {
  @IsIn(['EXPO', 'WEB']) provider!: PushProvider;
  /** An Expo token (`ExponentPushToken[…]`) or a browser push endpoint (https). */
  @IsString() @MaxLength(1000) @Matches(/^(Expo(nent)?PushToken\[[^\]]+\]|https:\/\/\S+)$/) token!: string;
  @IsOptional() @ValidateNested() @Type(() => KeysDto) keys?: KeysDto;
  @IsOptional() @IsIn(LOCALES) locale?: Locale;
  @IsOptional() @IsString() @MaxLength(16) platform?: string;
}

class RemoveDeviceDto implements PushDeviceRemoveRequest {
  @IsString() @MaxLength(1000) token!: string;
}

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly chat: ChatService,
    private readonly posts: PostService,
  ) {}

  /** Public: the browser needs it before it can subscribe. */
  @Get('vapid-key')
  vapidKey(): VapidKeyResponse {
    return { key: this.notifications.vapidKey() };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() me: RequestUser, @Query() q: ListQueryDto): Promise<AppNotification[]> {
    return this.notifications.list(me, q.before, q.before_id);
  }

  /** The shell's counts on every screen: unread notifications, unread Чат messages, a provider's quota. */
  @Get('badges')
  @UseGuards(JwtAuthGuard)
  async badges(@CurrentUser() me: RequestUser): Promise<Badges> {
    const [notifications, chat, plan] = await Promise.all([
      this.notifications.unreadCount(me),
      this.chat.unreadCount(me),
      this.posts.providerPlan(me.id),
    ]);
    return { notifications, chat, plan };
  }

  @Put('read')
  @UseGuards(JwtAuthGuard)
  read(@CurrentUser() me: RequestUser, @Body() body: ReadDto): Promise<OkResponse> {
    return this.notifications.markRead(me, body.ids);
  }

  @Put(':id/read')
  @UseGuards(JwtAuthGuard)
  readOne(@CurrentUser() me: RequestUser, @Param('id') id: string): Promise<OkResponse> {
    return this.notifications.markRead(me, /^\d{1,18}$/.test(id) ? [id] : []);
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard)
  settings(@CurrentUser() me: RequestUser): Promise<NotificationSettings> {
    return this.notifications.settings(me);
  }

  @Put('settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(@CurrentUser() me: RequestUser, @Body() body: SettingsDto): Promise<NotificationSettings> {
    return this.notifications.updateSettings(me, body);
  }

  @Post('devices')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  register(@CurrentUser() me: RequestUser, @Body() body: DeviceDto): Promise<OkResponse> {
    return this.notifications.registerDevice(me, body);
  }

  @Delete('devices')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() me: RequestUser, @Body() body: RemoveDeviceDto): Promise<OkResponse> {
    return this.notifications.removeDevice(me, body.token);
  }
}
