import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { Post } from '../post/entities/post.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from '../enums/bookingstatus';
import { PostNotificationService } from '../post/post-notification.service';
import { CategoryService } from '../post/category.service';
import { EventsGateway, SOCKET_EVENTS } from '../events/events.gateway';

// Strip sensitive user fields; phone is only shared once a booking is ACCEPTED
const safeUser = (u: any, includePhone: boolean) => u && ({
  id: u.id,
  given_name: u.given_name,
  profile_picture: u.profile_picture,
  ...(includePhone ? { phone_number: u.phone_number } : {}),
});

const safePost = (p: any) => p && ({
  id: p.id,
  title: p.title,
  category: p.category,
  subcategory: p.subcategory,
  images: p.images,
  price_amount: p.price_amount,
  price_unit: p.price_unit,
});

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    private readonly notifications: PostNotificationService,
    private readonly categoryService: CategoryService,
    @Optional() private readonly events: EventsGateway,
  ) {}

  private sanitize(b: Booking) {
    const accepted = b.status === BookingStatus.ACCEPTED;
    return {
      ...b,
      post: safePost(b.post),
      customer: safeUser(b.customer, accepted),
      provider: safeUser(b.provider, accepted),
    };
  }

  async create(customerId: string, dto: CreateBookingDto) {
    const post = await this.postRepository.findOne({ where: { id: dto.post_id }, relations: ['user'] });
    if (!post) throw new NotFoundException('Post not found');
    if (post.approval_status !== 'APPROVED') throw new BadRequestException({ code: 'BOOKING_POST_UNAVAILABLE', message: 'Post is not available for booking' });
    if (!post.user) throw new BadRequestException('Post has no owner');
    if (post.user.id === customerId) throw new BadRequestException({ code: 'BOOKING_SELF', message: 'You cannot book your own post' });

    const schema = await this.categoryService.getCategory(post.category).catch(() => null);
    if (!schema?.has_rental_status) throw new BadRequestException({ code: 'BOOKING_CATEGORY_UNSUPPORTED', message: 'This category does not support bookings' });

    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new BadRequestException({ code: 'BOOKING_DATE_RANGE', message: 'Invalid date range' });
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (start < today) throw new BadRequestException({ code: 'BOOKING_DATE_PAST', message: 'Start date is in the past' });

    const existing = await this.bookingRepository.findOne({
      where: { post: { id: post.id }, customer: { id: customerId }, status: BookingStatus.PENDING },
    });
    if (existing) throw new BadRequestException({ code: 'BOOKING_ALREADY_PENDING', message: 'You already have a pending request for this post' });

    const booking = this.bookingRepository.create({
      post,
      customer: { id: customerId } as any,
      provider: post.user,
      start_date: start,
      end_date: end,
      message: dto.message,
      status: BookingStatus.PENDING,
    });
    const saved = await this.bookingRepository.save(booking);

    this.events?.emitBookingEvent(post.user.id, SOCKET_EVENTS.BOOKING_REQUESTED, { bookingId: saved.id, postId: post.id });
    this.notifications.notifyUsers(
      [post.user.id],
      'Шинэ захиалгын хүсэлт',
      `"${post.title ?? schema.label}" зарт захиалгын хүсэлт ирлээ.`,
      { bookingId: saved.id, notifType: SOCKET_EVENTS.BOOKING_REQUESTED },
    ).catch(err => this.logger.warn(`booking notify backstop: ${err?.message}`));

    const full = await this.findOwn(saved.id);
    return this.sanitize(full ?? saved);
  }

  private findOwn(id: number): Promise<Booking | null> {
    return this.bookingRepository.findOne({
      where: { id },
      relations: ['post', 'customer', 'provider'],
    });
  }

  async listForCustomer(customerId: string) {
    const items = await this.bookingRepository.find({
      where: { customer: { id: customerId } },
      relations: ['post', 'provider', 'customer'],
      order: { date_created: 'DESC' },
      take: 100,
    });
    return items.map((b) => this.sanitize(b));
  }

  async listForProvider(providerId: string) {
    const items = await this.bookingRepository.find({
      where: { provider: { id: providerId } },
      relations: ['post', 'customer', 'provider'],
      order: { date_created: 'DESC' },
      take: 100,
    });
    return items.map((b) => this.sanitize(b));
  }

  async respond(id: number, providerId: string, accept: boolean, responseMessage?: string) {
    const booking = await this.findOwn(id);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.provider?.id !== providerId) throw new ForbiddenException({ code: 'BOOKING_NOT_YOURS', message: 'Not your booking to respond to' });
    if (booking.status !== BookingStatus.PENDING) throw new BadRequestException({ code: 'BOOKING_NOT_PENDING', message: 'Booking is not pending' });

    if (accept) {
      // Refuse overlap with an already-accepted booking on the same post
      const overlap = await this.bookingRepository.createQueryBuilder('b')
        .where('b.postId = :postId AND b.id != :id AND b.status = :accepted', {
          postId: booking.post.id, id, accepted: BookingStatus.ACCEPTED,
        })
        .andWhere('b.start_date <= :end AND b.end_date >= :start', {
          start: booking.start_date, end: booking.end_date,
        })
        .getOne();
      if (overlap) throw new BadRequestException({ code: 'BOOKING_OVERLAP', message: 'Dates overlap an already accepted booking' });
    }

    booking.status = accept ? BookingStatus.ACCEPTED : BookingStatus.DECLINED;
    booking.response_message = responseMessage ?? booking.response_message;
    const saved = await this.bookingRepository.save(booking);

    this.events?.emitBookingEvent(booking.customer.id, SOCKET_EVENTS.BOOKING_RESPONDED, {
      bookingId: saved.id, status: saved.status,
    });
    this.notifications.notifyUsers(
      [booking.customer.id],
      accept ? 'Захиалга баталгаажлаа' : 'Захиалга татгалзагдлаа',
      accept
        ? `"${booking.post.title ?? ''}" захиалгын хүсэлт зөвшөөрөгдлөө.`
        : `"${booking.post.title ?? ''}" захиалгын хүсэлт татгалзагдлаа.`,
      { bookingId: saved.id, notifType: SOCKET_EVENTS.BOOKING_RESPONDED },
    ).catch(err => this.logger.warn(`booking notify backstop: ${err?.message}`));

    return this.sanitize(saved);
  }

  async cancel(id: number, customerId: string) {
    const booking = await this.findOwn(id);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.customer?.id !== customerId) throw new ForbiddenException({ code: 'BOOKING_NOT_YOURS', message: 'Not your booking' });
    if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.ACCEPTED) {
      throw new BadRequestException({ code: 'BOOKING_NOT_CANCELLABLE', message: 'Booking cannot be cancelled' });
    }

    booking.status = BookingStatus.CANCELLED;
    const saved = await this.bookingRepository.save(booking);

    this.events?.emitBookingEvent(booking.provider.id, SOCKET_EVENTS.BOOKING_CANCELLED, { bookingId: saved.id });
    this.notifications.notifyUsers(
      [booking.provider.id],
      'Захиалга цуцлагдлаа',
      `"${booking.post.title ?? ''}" захиалга цуцлагдлаа.`,
      { bookingId: saved.id, notifType: SOCKET_EVENTS.BOOKING_CANCELLED },
    ).catch(err => this.logger.warn(`booking notify backstop: ${err?.message}`));

    return this.sanitize(saved);
  }

  // Reviews eligibility: has the customer ever had an accepted booking with this provider?
  async hasAcceptedBooking(customerId: string, providerId: string): Promise<boolean> {
    const count = await this.bookingRepository.count({
      where: { customer: { id: customerId }, provider: { id: providerId }, status: BookingStatus.ACCEPTED },
    });
    return count > 0;
  }
}
