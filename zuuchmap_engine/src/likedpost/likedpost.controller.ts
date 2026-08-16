import {
  Controller, Post, Delete, Get,
  Param, Query, Body, Request, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LikedpostService } from './likedpost.service';

@Controller('like')
@UseGuards(AuthGuard('jwt'))
export class LikedpostController {
  constructor(private readonly likedPostService: LikedpostService) {}

  @Post()
  likePost(@Body() body: { post_type: string; post_id: number }, @Request() req: any) {
    const user_id = req.user?.id;
    if (!user_id) throw new UnauthorizedException('Authentication required');
    return this.likedPostService.likePost(user_id, body.post_type, body.post_id);
  }

  @Delete(':post_type/:post_id')
  unlikePost(
    @Param('post_type') post_type: string,
    @Param('post_id') post_id: number,
    @Request() req: any,
  ) {
    const user_id = req.user?.id;
    if (!user_id) throw new UnauthorizedException('Authentication required');
    return this.likedPostService.unlikePost(user_id, post_type, post_id);
  }

  @Get('check/:post_type/:post_id')
  async checkPostLiked(
    @Param('post_type') post_type: string,
    @Param('post_id') post_id: number,
    @Request() req: any,
  ) {
    const user_id = req.user?.id;
    if (!user_id) return { is_liked: false };
    return { is_liked: await this.likedPostService.checkPostLiked(user_id, post_type, post_id) };
  }

  @Get()
  getUserLikedPosts(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Request() req: any,
  ) {
    const user_id = req.user?.id;
    if (!user_id) throw new UnauthorizedException('Authentication required');
    return this.likedPostService.getUserLikedPosts(user_id, Number(page), Number(limit));
  }

  @Get('stats/:post_type/:post_id')
  getLikeStats(
    @Param('post_type') post_type: string,
    @Param('post_id') post_id: number,
  ) {
    return this.likedPostService.getLikeStatistics(post_type, post_id);
  }

  @Get('ids')
  async getUserLikedPostIds(
    @Query('post_type') post_type: string,
    @Request() req: any,
  ) {
    const user_id = req.user?.id;
    if (!user_id) return { liked_post_ids: [] };
    return { liked_post_ids: await this.likedPostService.getUserLikedPostIds(user_id, post_type) };
  }
}
