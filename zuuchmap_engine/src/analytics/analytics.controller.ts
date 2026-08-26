import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService, IncomingEvent } from './analytics.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Public collector. Anonymous visitors are the whole point — attribution for
   * a signed-in user is attached automatically when a valid token is present.
   */
  @Post('collect')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  @HttpCode(202)
  async collect(
    @Req() req,
    @Body() body: { anon_id?: string; events?: IncomingEvent[] },
  ) {
    const accepted = await this.analyticsService.collect(
      body?.events ?? [],
      body?.anon_id,
      req.user?.id,
    );
    return { accepted };
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async summary(@Query('days') days?: string) {
    return this.analyticsService.summary(Number(days) || 30);
  }
}
