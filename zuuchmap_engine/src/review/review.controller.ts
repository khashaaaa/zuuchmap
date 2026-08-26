import {
  Controller,
  Get,
  Post,
  Param,
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
  async forProvider(@Param('id') providerId: string, @Req() req) {
    const result = await this.reviewService.forProvider(providerId);
    const own = req.user?.id
      ? await this.reviewService.ownForProvider(req.user.id, providerId)
      : null;
    return { ...result, own };
  }
}
