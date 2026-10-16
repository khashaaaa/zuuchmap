import { Controller, DefaultValuePipe, Get, Inject, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import type { Paginated, User as ApiUser } from '@zuuchmap/core';
import { AUTH_CONFIG, type AuthConfig } from '../auth/auth.config';
import { AdminGuard } from '../auth/guards';
import { toApiUser } from './user.mapper';
import { UserService } from './user.service';

/** Declared after UserController in the module so any future `:id` route cannot shadow /user/profile. */
@Controller('user')
@UseGuards(AdminGuard)
export class UserAdminController {
  constructor(
    private readonly users: UserService,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  /** `GET /user?page&limit` newest first, max 100 per page. */
  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<Paginated<ApiUser>> {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const { items, total } = await this.users.list(p, l);
    return { items: items.map((u) => toApiUser(u, this.cfg)), total };
  }
}
