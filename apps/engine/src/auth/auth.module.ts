import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { AUTH_CONFIG, authConfigFromEnv } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TrustedDevice } from './entities/trusted-device.entity';
import { VerificationSession } from './entities/verification-session.entity';
import { AdminGuard, JwtAuthGuard, OptionalJwtAuthGuard } from './guards';
import { VerifyMnService } from './verify-mn.service';

/** Global so any module can use JwtAuthGuard / OptionalJwtAuthGuard / AdminGuard directly. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([VerificationSession, TrustedDevice]), UserModule],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: authConfigFromEnv },
    VerifyMnService,
    AuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    AdminGuard,
  ],
  exports: [AUTH_CONFIG, AuthService, JwtAuthGuard, OptionalJwtAuthGuard, AdminGuard],
})
export class AuthModule {}
