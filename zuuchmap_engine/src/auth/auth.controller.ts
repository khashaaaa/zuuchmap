import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { isAdmin } from '../admin/admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('otp/send')
  async sendOtp(@Body() body: { phone_number: string }) {
    try {
      const { phone_number } = body;

      if (!phone_number) {
        throw new HttpException('Phone number is required', HttpStatus.BAD_REQUEST);
      }

      const code = this.authService.generateOtp(phone_number);
      // TODO: Send SMS with `code` to `phone_number` here

      return {
        success: true,
        message: 'OTP sent successfully',
        data: {
          phone_number,
          expires_in: 300,
          code, // Remove this once SMS is wired
        }
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to send OTP',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('otp/verify')
  async verifyOtp(@Body() body: {
    phone_number: string;
    code?: string;
    biometric?: boolean;
    device_info?: any;
  }) {
    try {
      const { phone_number, code, biometric, device_info } = body;

      if (!phone_number) {
        throw new HttpException('Phone number is required', HttpStatus.BAD_REQUEST);
      }

      // If biometric auth, code is not required
      if (!biometric && !code) {
        throw new HttpException('Phone number and OTP code are required', HttpStatus.BAD_REQUEST);
      }

      const result = await this.authService.verifyOtp(phone_number, code, biometric, device_info);

      return {
        success: true,
        message: biometric ? 'Biometric authentication successful' : 'OTP verified successfully',
        data: {
          id: result.user.id,
          phone_number: result.user.phone_number,
          type: result.user.type,
          is_verified: result.user.is_verified,
          is_admin: isAdmin(result.user.phone_number),
          token: result.token
        }
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to verify OTP',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}