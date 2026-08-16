import { Controller, Get, Put, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('posts/pending')
  getPendingPosts(@Query('category') category?: string) {
    return this.adminService.getPendingPosts(category);
  }

  @Patch('posts/:id')
  editPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; details?: string },
  ) {
    return this.adminService.editPost(id, body);
  }

  @Put('posts/:id/approve')
  approvePost(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.approvePost(id);
  }

  @Put('posts/:id/reject')
  rejectPost(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    return this.adminService.rejectPost(id, reason);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }
}
