import { Injectable, UnauthorizedException, InternalServerErrorException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import { SimpleCache } from 'src/utils/cache';
import { isAdmin } from 'src/admin/admin.guard';
import * as crypto from 'crypto';

const OTP_TTL = Number(process.env.OTP_TTL_MS) || 5 * 60 * 1000;
const RATE_TTL = Number(process.env.RATE_TTL_MS) || 60 * 60 * 1000;
const RATE_LIMIT = Number(process.env.OTP_RATE_LIMIT) || 5;

@Injectable()
export class AuthService {
  private readonly otpCache = new SimpleCache();
  private readonly rateCache = new SimpleCache();

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) { }

  generateOtp(phone_number: string): string {
    const rateKey = `rate:${phone_number}`;
    const count = (this.rateCache.get<number>(rateKey) ?? 0);
    if (count >= RATE_LIMIT) {
      throw new HttpException('Too many OTP requests. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.rateCache.set(rateKey, count + 1, RATE_TTL);

    const code = process.env.OTP_OVERRIDE ?? crypto.randomInt(100000, 999999).toString();
    this.otpCache.set(`otp:${phone_number}`, code, OTP_TTL);
    return code;
  }

  async generateToken(user: User) {
    const payload = {
      sub: user.id,
      phone: user.phone_number,
      type: user.type
    };

    if (!process.env.JWT_SECRET) {
      throw new InternalServerErrorException('JWT secret not configured');
    }

    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '30d'
    });
  }

  async verifyOtp(
    phone_number: string,
    code?: string,
    biometric?: boolean,
    device_info?: { deviceId?: string; platform?: string; version?: string; [key: string]: unknown }
  ): Promise<{ user: { id: string; phone_number: string; type: string; is_verified: boolean; is_admin: boolean }; token: string }> {
    try {
      let user = await this.userRepository.findOne({ where: { phone_number } });

      // Handle biometric authentication
      if (biometric === true) {
        if (!user) {
          throw new UnauthorizedException('User not found');
        }

        // Check if user has biometric enrolled
        if (user.biometric !== 'enrolled') {
          throw new UnauthorizedException('Biometric not enrolled. Please use OTP authentication.');
        }

        // Biometric authentication successful
        user.is_verified = true;
        await this.userRepository.save(user);

        const token = await this.generateToken(user);

        return {
          user: {
            id: user.id,
            phone_number: user.phone_number,
            type: user.type,
            is_verified: user.is_verified,
            is_admin: isAdmin(user.phone_number),
          },
          token
        };
      }

      // Handle OTP authentication (existing logic)
      if (!code) {
        throw new UnauthorizedException('OTP code is required for non-biometric authentication');
      }

      const cached = this.otpCache.get<string>(`otp:${phone_number}`);
      if (!cached || cached !== code) {
        throw new UnauthorizedException('Invalid or expired OTP code');
      }
      this.otpCache.del(`otp:${phone_number}`);

      if (!user) {
        user = this.userRepository.create({
          phone_number,
          is_verified: true,
        });
        await this.userRepository.save(user);
      } else {
        user.is_verified = true;
        await this.userRepository.save(user);
      }

      const token = await this.generateToken(user);

      return {
        user: {
          id: user.id,
          phone_number: user.phone_number,
          type: user.type,
          is_verified: user.is_verified,
          is_admin: isAdmin(user.phone_number),
        },
        token
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to verify OTP: ' + error.message);
    }
  }

  async validateUser(userId: string): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['company']
      });

      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}