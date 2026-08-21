import {
  Controller, Get, Post, Patch, Delete, Put,
  Param, Body, Query, Req, UseGuards, UseInterceptors,
  UploadedFiles, ParseIntPipe, Logger, NotFoundException,
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

const UPLOAD_DIR = './uploads/posts';

@Controller('posts')
export class PostController {
  private readonly logger = new Logger(PostController.name);
  constructor(
    private readonly postService: PostService,
    private readonly categoryService: CategoryService,
  ) {}

  // ─── Posts ────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createPostImageUploadInterceptor(UPLOAD_DIR))
  create(
    @Body() dto: CreatePostDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req,
  ) {
    if (!dto.user) dto.user = req.user?.id;
    return this.postService.create(dto, files);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Query() query: Record<string, string>, @Req() req) {
    const { category, subcategory, province, district, approval_status, status, page, limit, q, ...rest } = query;
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
    @Query('increment_view') increment?: string,
    @Req() req?,
  ) {
    const post = await this.postService.findOne(id);
    // Unapproved posts are visible only to their owner and admins. 404 (not
    // 403) so unmoderated content doesn't leak its existence.
    const isOwner = !!req?.user?.id && post.user?.id === req.user.id;
    if (post.approval_status !== 'APPROVED' && !isOwner && !isAdmin(req?.user?.phone_number)) {
      throw new NotFoundException(`Post #${id} not found`);
    }
    if (increment === 'true') {
      const userId = req?.user?.id;
      await this.postService.incrementViews(id, userId).catch((err) => this.logger.warn(`incrementViews failed for post ${id}`, err?.message));
    }
    return { ...post, user: publicUser(post.user) };
  }

  @Put(':id/views')
  @UseGuards(JwtAuthGuard)
  incrementViews(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.postService.incrementViews(id, req.user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createPostImageUploadInterceptor(UPLOAD_DIR))
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

  @Get('categories/:key')
  getCategory(@Param('key') key: string) {
    return this.categoryService.getCategory(key);
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
