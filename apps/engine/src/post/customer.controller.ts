import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { LikeIdsResponse, LikeResponse, ListingListItem, Paginated, SavedSearch } from '@zuuchmap/core';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { CreateSavedSearchDto, LikeDto, LikesQueryDto, MergeLikesDto, UpdateSavedSearchDto } from './dto/post.dto';
import { LikeService } from './like.service';
import { SavedSearchService } from './saved-search.service';

/** Saved listings. Guests keep theirs on the device and `merge` them at sign-in. */
@Controller('likes')
@UseGuards(JwtAuthGuard)
export class LikeController {
  constructor(private readonly likes: LikeService) {}

  @Get()
  list(@CurrentUser() me: RequestUser, @Query() q: LikesQueryDto): Promise<Paginated<ListingListItem>> {
    return this.likes.list(me, q.page, q.limit);
  }

  @Get('ids')
  async ids(@CurrentUser() me: RequestUser): Promise<LikeIdsResponse> {
    return { ids: await this.likes.ids(me) };
  }

  @Post()
  @HttpCode(201)
  like(@CurrentUser() me: RequestUser, @Body() body: LikeDto): Promise<LikeResponse> {
    return this.likes.like(me, body.post_id);
  }

  @Post('merge')
  @HttpCode(200)
  async merge(@CurrentUser() me: RequestUser, @Body() body: MergeLikesDto): Promise<LikeIdsResponse> {
    return { ids: await this.likes.merge(me, body.post_ids) };
  }

  @Delete(':post_id')
  unlike(@CurrentUser() me: RequestUser, @Param('post_id', ParseIntPipe) postId: number): Promise<LikeResponse> {
    return this.likes.unlike(me, postId);
  }
}

/** Up to SAVED_SEARCH_LIMIT named browse queries per account. */
@Controller('saved-searches')
@UseGuards(JwtAuthGuard)
export class SavedSearchController {
  constructor(private readonly searches: SavedSearchService) {}

  @Get()
  list(@CurrentUser() me: RequestUser): Promise<SavedSearch[]> {
    return this.searches.list(me);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() me: RequestUser, @Body() body: CreateSavedSearchDto): Promise<SavedSearch> {
    return this.searches.create(me, body);
  }

  @Patch(':id')
  update(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateSavedSearchDto): Promise<SavedSearch> {
    return this.searches.update(me, id, body);
  }

  /** The client opened the search: "N new" restarts from now. */
  @Post(':id/seen')
  @HttpCode(200)
  seen(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<SavedSearch> {
    return this.searches.seen(me, id);
  }

  @Delete(':id')
  remove(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    return this.searches.remove(me, id);
  }
}
