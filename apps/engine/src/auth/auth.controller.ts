import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { OkResponse, VerifyStartResponse, VerifyStatusResponse } from '@zuuchmap/core';
import { AuthService } from './auth.service';
import { LogoutDto, VerifyStartDto, VerifyStatusDto } from './dto/auth.dto';
import { CurrentUser, JwtAuthGuard } from './guards';
import type { RequestUser } from './request-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * A trusted device gets a token straight away; otherwise the text-in instructions. Per
   * address, generous for carrier CGNAT: the real limit is VERIFY_RATE_LIMIT per phone number.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('verify/start')
  @HttpCode(200)
  start(@Body() body: VerifyStartDto): Promise<VerifyStartResponse> {
    return this.auth.startVerification(body.phone_number, body.device_id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('verify/status')
  @HttpCode(200)
  status(@Body() body: VerifyStatusDto): Promise<VerifyStatusResponse> {
    return this.auth.checkVerification(body.session_id);
  }

  /** verify.mn nudge: unauthenticated, never trusted alone; always answers 200 quickly. */
  @Get('verify/callback/:id')
  @HttpCode(200)
  callback(@Param('id') id: string): { received: true } {
    void this.auth.handleCallback(id);
    return { received: true };
  }

  /** Ends this token; with `device_id` (web) also forgets the device, so signing in here needs a new verification. */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: RequestUser | undefined, @Body() body: LogoutDto): Promise<OkResponse> {
    if (user) await this.auth.signOut(user, body.device_id);
    return { ok: true };
  }
}
