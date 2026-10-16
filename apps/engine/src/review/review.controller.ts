import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { ProviderReviews, Review, ReviewSort, SellerProfile, ReviewReplyRequest, ReviewWriteRequest } from '@zuuchmap/core';
import { CurrentUser, JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { ReviewService } from './review.service';

class WriteReviewDto implements ReviewWriteRequest {
  @IsUUID() provider_id!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(1000) comment?: string | null;
}

class ReplyReviewDto implements ReviewReplyRequest {
  @IsString() @MaxLength(1000) reply!: string;
}

class ProviderReviewsQueryDto {
  @IsOptional() @IsIn(['new', 'high', 'low']) sort?: ReviewSort;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  write(@CurrentUser() me: RequestUser, @Body() body: WriteReviewDto): Promise<Review> {
    return this.reviews.upsert(me, body.provider_id, body.rating, body.comment);
  }

  @Put(':id/reply')
  @UseGuards(JwtAuthGuard)
  reply(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: ReplyReviewDto): Promise<Review> {
    return this.reviews.reply(me, id, body.reply);
  }

  @Get('provider/:id')
  @UseGuards(OptionalJwtAuthGuard)
  forProvider(@CurrentUser() me: RequestUser | undefined, @Param('id', ParseUUIDPipe) id: string, @Query() q: ProviderReviewsQueryDto): Promise<ProviderReviews> {
    return this.reviews.forProvider(me, id, q.sort, q.page, q.limit);
  }
}

@Controller('sellers')
export class SellerController {
  constructor(private readonly reviews: ReviewService) {}

  @Get(':id')
  seller(@Param('id', ParseUUIDPipe) id: string): Promise<SellerProfile> {
    return this.reviews.seller(id);
  }
}
