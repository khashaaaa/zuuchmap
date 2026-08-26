import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Begin phone verification.
   *
   * Returns `verified: true` with a token when the device is already trusted,
   * otherwise returns the code the user must SMS to the shortcode. That code is
   * deliberately public: possession is proven by the SMS originating from the
   * claimed number, not by knowledge of the code.
   */
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('verify/start')
  async start(@Body() body: { phone_number: string; device_id?: string }) {
    if (!body?.phone_number) {
      throw new HttpException(
        'Phone number is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.authService.startVerification(
      body.phone_number,
      body.device_id,
    );
    return { success: true, data: result };
  }

  /** Poll for completion. Client-side interval should be ~2s. */
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @Post('verify/status')
  async status(@Body() body: { session_id: string }) {
    if (!body?.session_id) {
      throw new HttpException('session_id is required', HttpStatus.BAD_REQUEST);
    }
    const result = await this.authService.checkVerification(body.session_id);
    return { success: true, data: result };
  }

  /**
   * verify.mn calls this (GET, no body, no signature) the moment an SMS lands.
   * Treated purely as a nudge — the authoritative check happens against their
   * status endpoint. Must return 200 quickly or they retry up to 5 times.
   */
  @Get('verify/callback/:sessionId')
  @HttpCode(200)
  async callback(@Param('sessionId') sessionId: string) {
    // Fire and forget so the provider never waits on our DB round-trip.
    void this.authService.handleCallback(sessionId);
    return { received: true };
  }

  /**
   * Retired endpoints.
   *
   * Both previously issued a token on an unverified claim — /otp/send returned
   * the OTP in its own response body, and /otp/verify accepted `biometric: true`
   * with no proof. Any client still calling them must update.
   */
  @Post('otp/send')
  retiredSend() {
    return this.retired();
  }

  @Post('otp/verify')
  retiredVerify() {
    return this.retired();
  }

  private retired(): never {
    throw new HttpException(
      'This authentication method has been retired. Please update the app.',
      HttpStatus.GONE,
    );
  }
}
