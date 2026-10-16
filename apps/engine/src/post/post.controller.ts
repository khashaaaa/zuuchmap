import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, Req,
  UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type {
  AdminListing, AvailabilityResponse, BlockDaysResponse, BrowseResponse, LandingStats, Listing, ListingListItem, ListingPerformanceDetail,
  ListingViewResponse, MapResponse, MyListingItem, MyListingStats, MyPerformance, Paginated, PhotoIntent, PhotoUploadResponse,
} from '@zuuchmap/core';
import { AdminGuard, CurrentUser, JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { AvailabilityService } from './availability.service';
import { ContactService } from './contact.service';
import {
  AdminListQueryDto, AvailabilityQueryDto, BlockDaysDto, ContactDto, CreateListingDto, MAX_PHOTOS, ListQueryDto, MapQueryDto,
  PerformanceQueryDto, PhotoIntentDto, RejectListingDto, SimilarQueryDto, UpdateListingDto,
} from './dto/post.dto';
import { MAX_PHOTO_BYTES } from './photo-image';
import { PostViewService } from './post-view.service';
import { PostService } from './post.service';
import { ipKey, visitorKey } from './visitor';

/** `attr.<key>`, `attr.<key>_min`, `attr.<key>_max` straight from the query string. */
function attrFilters(query: Request['query']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (!k.startsWith('attr.') || typeof v !== 'string') continue;
    const key = k.slice(5);
    if (/^[a-z0-9_]{1,64}$/.test(key) && v.length <= 100) out[key] = v;
  }
  return out;
}

@Controller('posts')
export class PostController {
  constructor(
    private readonly posts: PostService,
    private readonly views: PostViewService,
    private readonly availability: AvailabilityService,
    private readonly contacts: ContactService,
  ) {}

  @Get()
  browse(@Query() q: ListQueryDto, @Req() req: Request): Promise<BrowseResponse> {
    return this.posts.browse(q, attrFilters(req.query));
  }

  /** Pins for the visible area only, clustered above one listing per grid cell at `zoom`. */
  @Get('map')
  map(@Query() q: MapQueryDto, @Req() req: Request): Promise<MapResponse> {
    return this.posts.map(q, attrFilters(req.query));
  }

  /** Landing counters: live listings, provinces, per family and category. Cached five minutes. */
  @Get('stats')
  landing(): Promise<LandingStats> {
    return this.posts.landingStats();
  }

  @Post('availability/block')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  block(@CurrentUser() me: RequestUser, @Body() body: BlockDaysDto): Promise<BlockDaysResponse> {
    return this.availability.block(me, body.post_ids, body.start_date, body.end_date);
  }

  @Delete('availability/block/:id')
  @UseGuards(JwtAuthGuard)
  unblock(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.availability.unblock(me, id);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() me: RequestUser): Promise<MyListingItem[]> {
    return this.posts.listMine(me);
  }

  @Get('mine/stats')
  @UseGuards(JwtAuthGuard)
  stats(@CurrentUser() me: RequestUser): Promise<MyListingStats> {
    return this.posts.stats(me);
  }

  /** Views, saves, contacts and booking requests: the last `days` against the `days` before. */
  @Get('mine/performance')
  @UseGuards(JwtAuthGuard)
  performance(@CurrentUser() me: RequestUser, @Query() q: PerformanceQueryDto): Promise<MyPerformance> {
    return this.contacts.mine(me, q.days);
  }

  @Post('photos/intent')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  intent(@CurrentUser() me: RequestUser, @Body() body: PhotoIntentDto): Promise<PhotoIntent> {
    return this.posts.createUploadIntent(me, body.content_type);
  }

  /** Multipart `files` (1..10). Validated and re-encoded server side; returns keys for `images`. */
  @Post('photos')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(FilesInterceptor('files', MAX_PHOTOS, { limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS } }))
  async upload(
    @CurrentUser() me: RequestUser,
    @UploadedFiles() files: Array<{ buffer: Buffer }> | undefined,
  ): Promise<PhotoUploadResponse> {
    if (!files?.length) throw new BadRequestException({ message: 'No files', code: 'INVALID_PHOTO' });
    return { photos: await this.posts.uploadPhotos(me, files.map((f) => f.buffer)) };
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  one(@Param('id', ParseIntPipe) id: number, @CurrentUser() me?: RequestUser): Promise<Listing> {
    return this.posts.getOne(id, me);
  }

  @Get(':id/similar')
  similar(@Param('id', ParseIntPipe) id: number, @Query() q: SimilarQueryDto): Promise<ListingListItem[]> {
    return this.posts.similar(id, q.limit);
  }

  /** Booked and blocked ranges in the window (default the next 90 days), for the calendar. */
  @Get(':id/availability')
  calendar(@Param('id', ParseIntPipe) id: number, @Query() q: AvailabilityQueryDto): Promise<AvailabilityResponse> {
    return this.posts.availabilityOf(id, q.from, q.to);
  }

  @Get(':id/performance')
  @UseGuards(JwtAuthGuard)
  listingPerformance(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number, @Query() q: PerformanceQueryDto): Promise<ListingPerformanceDetail> {
    return this.contacts.one(me, id, q.days);
  }

  /** A call tapped (the dialer opens on the client). Chats and booking requests are recorded where they happen. */
  @Post(':id/contact')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  async contact(@Param('id', ParseIntPipe) id: number, @Body() body: ContactDto, @Req() req: Request, @CurrentUser() me?: RequestUser): Promise<{ recorded: boolean }> {
    await this.posts.assertExists(id);
    return { recorded: await this.contacts.record(id, body.kind, me?.id ?? null, visitorKey(req, me === undefined), undefined, ipKey(req)) };
  }

  @Put(':id/views')
  @UseGuards(OptionalJwtAuthGuard)
  async view(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @CurrentUser() me?: RequestUser,
  ): Promise<ListingViewResponse> {
    await this.posts.assertExists(id);
    return this.views.countView(
      {
        userId: me?.id ?? null,
        visitorKey: visitorKey(req, me === undefined),
        ipKey: ipKey(req),
        audience: !me?.is_admin,
      },
      id,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() me: RequestUser, @Body() body: CreateListingDto): Promise<Listing> {
    return this.posts.create(me, body);
  }

  @Post(':id/renew')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  renew(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number): Promise<Listing> {
    return this.posts.renew(me, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  patch(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateListingDto): Promise<Listing> {
    return this.posts.update(me, id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.posts.remove(me, id);
  }
}

@Controller('admin/posts')
@UseGuards(AdminGuard)
export class PostAdminController {
  constructor(private readonly posts: PostService) {}

  @Get()
  list(@Query() q: AdminListQueryDto): Promise<Paginated<AdminListing>> {
    return this.posts.adminList(q);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseIntPipe) id: number): Promise<AdminListing> {
    return this.posts.approve(id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseIntPipe) id: number, @Body() body: RejectListingDto): Promise<AdminListing> {
    return this.posts.reject(id, body);
  }
}
