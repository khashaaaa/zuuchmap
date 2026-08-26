import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { VerifyMnService } from './verify-mn.service';
import { User } from 'src/user/entities/user.entity';
import { VerificationSession } from './entities/verification-session.entity';
import { TrustedDevice } from './entities/trusted-device.entity';
import { jwtSecret } from 'src/utils/jwt-secret';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: '30d' },
      }),
    }),
    TypeOrmModule.forFeature([User, VerificationSession, TrustedDevice]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, VerifyMnService],
  exports: [AuthService],
})
export class AuthModule {}
