import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  upsert(@Body() dto: CreateReviewDto, @Req() req) {
    return this.reviewService.upsert(req.user.id, dto);
  }

  @Get('provider/:id')
  @UseGuards(OptionalJwtAuthGuard)
  async forProvider(
    @Param('id', ParseUUIDPipe) providerId: string,
    @Req() req,
  ) {
    const userId: string | undefined = req.user?.id;
    const [result, own, canReview] = await Promise.all([
      this.reviewService.forProvider(providerId),
      userId ? this.reviewService.ownForProvider(userId, providerId) : null,
      // So a client shows the form only to someone the POST would accept,
      // rather than letting them write a review and answering 403.
      userId && userId !== providerId
        ? this.reviewService.canReview(userId, providerId)
        : false,
    ]);
    return { ...result, own, can_review: canReview };
  }
}
