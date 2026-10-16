import { Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  BROADCAST_AUDIENCES,
  type AdminAnalytics, type AdminCompanyVerifyRequest, type AdminOverview, type AdminUser, type AdminUserDetail, type AdminUserFilter,
  type BroadcastAudience, type BroadcastEstimate, type BroadcastRequest, type Paginated,
} from '@zuuchmap/core';
import { AdminGuard, CurrentUser } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { AdminService } from './admin.service';

class CompanyVerifyDto implements AdminCompanyVerifyRequest {
  @IsBoolean() verified!: boolean;
}

class BroadcastEstimateDto implements Pick<BroadcastRequest, 'audience' | 'category'> {
  @IsIn(BROADCAST_AUDIENCES) audience!: BroadcastAudience;
  @IsOptional() @IsString() @MaxLength(64) category?: string | null;
}

class BroadcastDto extends BroadcastEstimateDto implements BroadcastRequest {
  @IsString() @Matches(/\S/) @MaxLength(80) title!: string;
  @IsString() @Matches(/\S/) @MaxLength(300) body!: string;
}

const USER_FILTERS = ['PROVIDER', 'CUSTOMER', 'ADMIN'];

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  @Get('analytics')
  analytics(@Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number): Promise<AdminAnalytics> {
    return this.admin.analytics([7, 30, 90].includes(days) ? days : 7);
  }

  @Get('users')
  users(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ): Promise<Paginated<AdminUser>> {
    const filter = type && USER_FILTERS.includes(type) ? (type as AdminUserFilter) : undefined;
    return this.admin.users(q?.slice(0, 100), filter, Math.max(1, page), Math.min(100, Math.max(1, limit)));
  }

  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetail> {
    return this.admin.user(id);
  }

  @Delete('users/:id')
  deleteUser(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    return this.admin.deleteUser(id);
  }

  @Put('companies/:id/verify')
  verify(@Param('id', ParseUUIDPipe) id: string, @Body() body: CompanyVerifyDto): Promise<{ ok: true }> {
    return this.admin.verifyCompany(id, body.verified);
  }

  @Post('broadcast/estimate')
  @HttpCode(200)
  estimate(@Body() body: BroadcastEstimateDto): Promise<BroadcastEstimate> {
    return this.admin.estimate(body);
  }

  @Post('broadcast')
  @HttpCode(200)
  broadcast(@CurrentUser() me: RequestUser, @Body() body: BroadcastDto): Promise<BroadcastEstimate> {
    return this.admin.broadcast(me, body);
  }
}

