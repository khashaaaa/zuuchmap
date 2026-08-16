import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

interface JwtPayload {
    sub: string;
    phone: string;
    type: string;
    iat?: number;
    exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private authService: AuthService) {
        if (!process.env.JWT_SECRET) {
            throw new InternalServerErrorException('JWT_SECRET environment variable is not set');
        }
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET,
        });
    }

    async validate(payload: JwtPayload) {
        try {
            const user = await this.authService.validateUser(payload.sub);

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            return user;
        } catch {
            throw new UnauthorizedException('Invalid token');
        }
    }
}