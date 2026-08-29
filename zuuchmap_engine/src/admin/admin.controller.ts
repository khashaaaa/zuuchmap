import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { PostNotificationService } from '../post/post-notification.service';
import { PlanService } from '../user/plan.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly notifications: PostNotificationService,
    private readonly plans: PlanService,
  ) {}

  /** Push campaign to all users, or narrowed by role / post category. */
  @Post('broadcast')
  broadcast(
    @Body()
    body: {
      title?: string;
      body?: string;
      user_type?: string;
      category?: string;
    },
  ) {
    const title = body?.title?.trim();
    const message = body?.body?.trim();
    if (!title || !message)
      throw new BadRequestException('title and body are required');
    return this.notifications.broadcast(
      title.slice(0, 100),
      message.slice(0, 300),
      {
        user_type: body.user_type,
        category: body.category,
      },
    );
  }

  @Get('posts/pending')
  getPendingPosts(
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getPendingPosts(
      category,
      page ? +page : 1,
      limit ? +limit : 50,
    );
  }

  /** Bulk approve. One request, per-post outcomes — see AdminService.approvePosts. */
  @Put('posts/approve')
  approvePosts(@Body() body: { ids?: number[] }) {
    const ids = Array.isArray(body?.ids)
      ? body.ids.map(Number).filter(Number.isInteger)
      : [];
    if (!ids.length)
      throw new BadRequestException(
        'ids must be a non-empty array of post ids',
      );
    // Bounded so one call can't hold a worker for an unbounded stretch; the
    // moderation queue pages at 50, which is the realistic "select all".
    if (ids.length > 100)
      throw new BadRequestException('at most 100 ids per request');
    return this.adminService.approvePosts(ids);
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
    @Body() body: { reason: string; field_key?: string },
  ) {
    return this.adminService.rejectPost(id, body?.reason, body?.field_key);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  /**
   * Grants or revokes a provider plan — the manual path, used after a bank
   * transfer has been reconciled by hand. PlanService is the same path a
   * settled QPay invoice takes, so the two cannot drift.
   */
  @Put('users/:id/plan')
  setUserPlan(
    @Param('id') id: string,
    @Body() body: { plan: string; months?: number },
  ) {
    return this.plans.setPlan(id, body.plan, body.months ?? 1);
  }

  @Put('companies/:id/verify')
  verifyCompany(
    @Param('id') id: string,
    @Body() body: { is_verified: boolean },
  ) {
    return this.adminService.setCompanyVerified(id, body.is_verified);
  }

  @Put('posts/:id/feature')
  featurePost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { days: number },
  ) {
    return this.adminService.featurePost(id, body.days);
  }
}
