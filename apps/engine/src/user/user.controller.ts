import { Body, Controller, Get, HttpCode, Inject, Patch, Post, UseGuards } from '@nestjs/common';
import type { User as ApiUser } from '@zuuchmap/core';
import { AUTH_CONFIG, type AuthConfig } from '../auth/auth.config';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { SetRoleDto, UpdateProfileDto } from './dto/user.dto';
import { toApiUser } from './user.mapper';
import { UserService } from './user.service';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly users: UserService,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  @Get('profile')
  async profile(@CurrentUser() me: RequestUser): Promise<ApiUser> {
    return toApiUser(await this.users.getById(me.id), this.cfg);
  }

  @Patch('profile')
  async update(@CurrentUser() me: RequestUser, @Body() body: UpdateProfileDto): Promise<ApiUser> {
    return toApiUser(await this.users.updateProfile(me.id, body), this.cfg);
  }

  /** Set once (first listing makes you a provider); repeating the same role is a no-op. */
  @Post('role')
  @HttpCode(200)
  async role(@CurrentUser() me: RequestUser, @Body() body: SetRoleDto): Promise<ApiUser> {
    return toApiUser(await this.users.setRole(me.id, body.type), this.cfg);
  }
}
