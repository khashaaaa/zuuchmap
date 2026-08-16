import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { User } from '../user/entities/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { BookingService } from '../booking/booking.service';
import { isAdmin } from '../admin/admin.guard';

const safeAuthor = (u: any) => u && ({
  id: u.id,
  given_name: u.given_name,
  profile_picture: u.profile_picture,
});

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly bookingService: BookingService,
  ) {}

  // One review per author per provider — repeat submissions update the existing one
  async upsert(authorId: string, dto: CreateReviewDto) {
    if (dto.provider_id === authorId) throw new BadRequestException('You cannot review yourself');

    const provider = await this.userRepository.findOne({ where: { id: dto.provider_id } });
    if (!provider) throw new NotFoundException('Provider not found');

    const eligible = await this.bookingService.hasAcceptedBooking(authorId, dto.provider_id);
    if (!eligible) {
      throw new ForbiddenException('Only customers with an accepted booking can review this provider');
    }

    let review = await this.reviewRepository.findOne({
      where: { provider: { id: dto.provider_id }, author: { id: authorId } },
      relations: ['author', 'provider'],
    });
    if (review) {
      review.rating = dto.rating;
      review.comment = dto.comment ?? review.comment;
    } else {
      review = this.reviewRepository.create({
        provider,
        author: { id: authorId } as any,
        rating: dto.rating,
        comment: dto.comment,
      });
    }
    const saved = await this.reviewRepository.save(review);
    return { ...saved, author: safeAuthor(saved.author), provider: undefined };
  }

  async forProvider(providerId: string) {
    const reviews = await this.reviewRepository.find({
      where: { provider: { id: providerId } },
      relations: ['author'],
      order: { date_updated: 'DESC' },
      take: 100,
    });
    const count = reviews.length;
    const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
    return {
      average: Math.round(average * 10) / 10,
      count,
      reviews: reviews.map((r) => ({ ...r, author: safeAuthor(r.author) })),
    };
  }

  // The caller's own review of a provider, if any — lets clients prefill the form
  async ownForProvider(authorId: string, providerId: string) {
    const review = await this.reviewRepository.findOne({
      where: { provider: { id: providerId }, author: { id: authorId } },
    });
    return review ?? null;
  }

  async remove(id: number, userId: string, userPhone: string) {
    const review = await this.reviewRepository.findOne({ where: { id }, relations: ['author'] });
    if (!review) throw new NotFoundException('Review not found');
    if (review.author?.id !== userId && !isAdmin(userPhone)) {
      throw new ForbiddenException('Not your review');
    }
    await this.reviewRepository.delete(id);
  }
}
