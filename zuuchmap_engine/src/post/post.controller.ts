import {
  Controller, Get, Post, Patch, Delete, Put,
  Param, Body, Query, Req, UseGuards, UseInterceptors,
  UploadedFiles, ParseIntPipe, NotFoundException,
} from '@nestjs/common';
import { publicUser } from '../utils/public-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { AdminGuard, isAdmin } from '../admin/admin.guard';
import { PostService } from './post.service';
import { CategoryService } from './category.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { createPostImageUploadInterceptor } from '../utils/uploader';

@Controller('posts')
export class PostController {
  constructor(
    private readonly postService: PostService,
    private readonly categoryService: CategoryService,
  ) {}

  // ─── Posts ────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createPostImageUploadInterceptor())
  create(
    @Body() dto: CreatePostDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req,
  ) {
    // Ownership is bound from the token, never the body: `if (!dto.user)` used to
    // let a caller pre-set `user` and plant a post on another account.
    return this.postService.create(dto, files, req.user?.id);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Query() query: Record<string, string>, @Req() req) {
    const { category, subcategory, province, district, approval_status, status, page, limit, q, sort, price_min, price_max, ...rest } = query;
    // Attribute filters arrive as attr.<key>=value (or attr.<key>_min / attr.<key>_max)
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k.startsWith('attr.')) attrs[k.slice(5)] = v;
    }
    // Moderation gate: only admins may browse beyond APPROVED posts.
    const requesterIsAdmin = isAdmin(req.user?.phone_number);
    return this.postService.findAll({
      category,
      subcategory,
      province,
      district,
      approval_status: requesterIsAdmin ? approval_status : 'APPROVED',
      status,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      q: q || undefined,
      attrs,
      sort,
      price_min,
      price_max,
    });
  }

  @Get('map')
  findForMap() {
    return this.postService.findForMap();
  }

  /**
   * Public marketplace counters for the landing page. Declared above `:id` so
   * the param route does not swallow it.
   */
  @Get('stats')
  publicStats() {
    return this.postService.publicStats();
  }

  /** Attention stats for the provider dashboard. Above `:id` like the routes around it. */
  @Get('mine/stats')
  @UseGuards(JwtAuthGuard)
  myStats(@Req() req) {
    return this.postService.providerStats(req.user.id);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.postService.findByUser(req.user.id, page ? +page : 1, limit ? +limit : 50);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req?,
  ) {
    const post = await this.postService.findOne(id);
    // Unapproved posts are visible only to their owner and admins. 404 (not
    // 403) so unmoderated content doesn't leak its existence.
    const isOwner = !!req?.user?.id && post.user?.id === req.user.id;
    const requesterIsAdmin = isAdmin(req?.user?.phone_number);
    if (post.approval_status !== 'APPROVED' && !isOwner && !requesterIsAdmin) {
      throw new NotFoundException(`Post #${id} not found`);
    }
    await this.postService.attachBusyDates([post]);
    // The pre-edit snapshot is moderation material — owner and admins only.
    const { previous_snapshot, ...rest } = post;
    return {
      ...rest,
      ...(isOwner || requesterIsAdmin ? { previous_snapshot } : {}),
      user: publicUser(post.user),
    };
  }

  /** Public. Same item shape as `GET /posts`; 404 when `:id` itself is not live. */
  @Get(':id/similar')
  async findSimilar(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    const items = await this.postService.findSimilar(id, limit ? +limit : 6);
    return items;
  }

  @Put(':id/views')
  @UseGuards(JwtAuthGuard)
  incrementViews(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.postService.incrementViews(id, req.user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createPostImageUploadInterceptor())
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req,
  ) {
    return this.postService.update(id, dto, files, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.postService.remove(id, req.user.id);
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  @Get('categories/all')
  getCategories() {
    return this.categoryService.getCategories();
  }

  @Get('categories/admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  getAllCategoriesForAdmin() {
    return this.categoryService.getAllCategoriesForAdmin();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, AdminGuard)
  createCategory(@Body() body: any) {
    return this.categoryService.createCategory(body);
  }

  @Patch('categories/:key')
  @UseGuards(JwtAuthGuard, AdminGuard)
  updateCategory(@Param('key') key: string, @Body() body: any) {
    return this.categoryService.updateCategory(key, body);
  }
}
