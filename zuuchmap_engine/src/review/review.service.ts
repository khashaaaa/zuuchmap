import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { User } from '../user/entities/user.entity';
import { Booking } from '../booking/entities/booking.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { BookingService } from '../booking/booking.service';

const safeAuthor = (u: any) =>
  u && {
    id: u.id,
    given_name: u.given_name,
    profile_picture: u.profile_picture,
  };

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly bookingService: BookingService,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
  ) {}

  // One review per author per provider — repeat submissions update the existing one
  async upsert(authorId: string, dto: CreateReviewDto) {
    if (dto.provider_id === authorId)
      throw new BadRequestException({
        code: 'REVIEW_SELF',
        message: 'You cannot review yourself',
      });

    const provider = await this.userRepository.findOne({
      where: { id: dto.provider_id },
    });
    if (!provider) throw new NotFoundException('Provider not found');

    const eligible = await this.bookingService.hasAcceptedBooking(
      authorId,
      dto.provider_id,
    );
    if (!eligible) {
      throw new ForbiddenException({
        code: 'REVIEW_NEEDS_BOOKING',
        message:
          'Only customers with an accepted booking can review this provider',
      });
    }

    let review = await this.reviewRepository.findOne({
      where: { provider: { id: dto.provider_id }, author: { id: authorId } },
      relations: ['author', 'provider'],
    });
    if (review) {
      review.rating = dto.rating;
      // Distinguish "left the comment alone" from "cleared it". Coalescing both
      // to the old text published the previous comment under the new rating —
      // a five-star write-up left standing beneath a one-star score.
      if (dto.comment !== undefined) review.comment = dto.comment || null;
    } else {
      review = this.reviewRepository.create({
        provider,
        author: { id: authorId },
        rating: dto.rating,
        comment: dto.comment,
      });
    }
    const saved = await this.reviewRepository.save(review);
    return { ...saved, author: safeAuthor(saved.author), provider: undefined };
  }

  async forProvider(providerId: string) {
    // Aggregate over the full set in SQL — the page below is capped at 100,
    // and an average computed from a truncated page is wrong past that.
    const [reviews, agg, stats] = await Promise.all([
      this.reviewRepository.find({
        where: { provider: { id: providerId } },
        relations: ['author'],
        order: { date_updated: 'DESC' },
        take: 100,
      }),
      this.reviewRepository
        .createQueryBuilder('r')
        .select('COUNT(*)', 'count')
        .addSelect('AVG(r.rating)', 'average')
        .where('r."providerId" = :providerId', { providerId })
        .getRawOne(),
      this.providerStats(providerId),
    ]);
    const count = Number(agg?.count ?? 0);
    const average = count ? Number(agg.average) : 0;
    return {
      average: Math.round(average * 10) / 10,
      count,
      reviews: reviews.map((r) => ({ ...r, author: safeAuthor(r.author) })),
      stats,
    };
  }

  // Provider credentials shown next to the rating. Response time is measured
  // from `responded_at`, which is written once when the provider answers — not
  // from date_updated, which any later write (the nightly review-prompt sweep,
  // among others) bumps. Rows with no responded_at fall out of the AVG rather
  // than counting as an instant or an eternal reply.
  async providerStats(providerId: string) {
    const [resp, completed, user] = await Promise.all([
      this.bookingRepository
        .createQueryBuilder('b')
        .select(
          'AVG(EXTRACT(EPOCH FROM (b.responded_at - b.date_created)))',
          'avg_seconds',
        )
        .where('b."providerId" = :providerId', { providerId })
        .andWhere('b.status IN (:...statuses)', {
          statuses: ['ACCEPTED', 'DECLINED'],
        })
        .andWhere('b.responded_at IS NOT NULL')
        .getRawOne(),
      this.bookingRepository
        .createQueryBuilder('b')
        .where('b."providerId" = :providerId', { providerId })
        .andWhere('b.status = :status', { status: 'ACCEPTED' })
        .andWhere('b.end_date < NOW()')
        .getCount(),
      this.userRepository.findOne({
        where: { id: providerId },
        relations: ['company'],
      }),
    ]);
    const avgSeconds =
      resp?.avg_seconds == null ? null : Number(resp.avg_seconds);
    return {
      avg_response_hours:
        avgSeconds == null || Number.isNaN(avgSeconds)
          ? null
          : Math.round((avgSeconds / 3600) * 10) / 10,
      completed_bookings: Number(completed ?? 0),
      member_since: user?.date_created
        ? new Date(user.date_created).toISOString()
        : null,
      company_verified: !!user?.company?.is_verified,
    };
  }

  // The caller's own review of a provider, if any — lets clients prefill the form
  async ownForProvider(authorId: string, providerId: string) {
    const review = await this.reviewRepository.findOne({
      where: { provider: { id: providerId }, author: { id: authorId } },
    });
    return review ?? null;
  }
}
