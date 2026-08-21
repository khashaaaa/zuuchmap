import {
  Controller,
  Get,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { isAdmin, AdminGuard } from '../admin/admin.guard';
import { profileSummary } from '../utils/public-user';

/**
 * Admin-only operations on other users' accounts.
 *
 * Shares the `user` prefix with UserController and must stay registered
 * AFTER it in UserModule — the wildcard `:id` routes here would otherwise
 * shadow the literal ones there (`/user/profile`, `/user/account`).
 *
 * No per-route try/catch: the global AllExceptionsFilter normalizes errors
 * and keeps the machine-readable `code` field intact.
 */
@Controller('user')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UserAdminController {
  constructor(private readonly userService: UserService) { }

  @Get()
  async findAll() {
    const users = await this.userService.findAll();
    return users.map((user) => ({
      ...user,
      is_admin: isAdmin(user.phone_number),
    }));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findOne(id);

    return {
      ...user,
      ...profileSummary(user),
      is_admin: isAdmin(user.phone_number),
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.userService.remove(id);
    return {
      message: `User with ID ${id} successfully deleted`,
      success: true
    };
  }
}
