import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Booking } from './entities/booking.entity';
import { Post } from '../post/entities/post.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from '../enums/bookingstatus';
import { Status } from '../enums/status';
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

  /**
   * Turns a constraint violation into the same error code the pre-flight check
   * would have produced. The check stays because it answers on the common path
   * without a failed write; this catches the concurrent case it cannot see.
   */
  private rethrowBookingConflict(err: any): never {
    const constraint: string = err?.constraint ?? '';
    if (constraint === 'UQ_booking_one_pending_per_customer_post') {
      throw new BadRequestException({ code: 'BOOKING_ALREADY_PENDING', message: 'You already have a pending request for this post' });
    }
    if (constraint === 'EX_booking_accepted_no_overlap') {
      throw new BadRequestException({ code: 'BOOKING_OVERLAP', message: 'Dates overlap an already accepted booking' });
    }
    throw err;
  }

  async create(customerId: string, dto: CreateBookingDto) {
    const post = await this.postRepository.findOne({ where: { id: dto.post_id }, relations: ['user'] });
    if (!post) throw new NotFoundException('Post not found');
    if (post.approval_status !== 'APPROVED') throw new BadRequestException({ code: 'BOOKING_POST_UNAVAILABLE', message: 'Post is not available for booking' });
    // Approval is not availability. RENTED is the provider's own "not right
    // now" toggle, and a post past `expires_at` is already gone from browse
    // whether or not the nightly sweep has flipped its status yet — a request
    // against either has nobody willing to answer it.
    if (post.status !== Status.ACTIVE) {
      throw new BadRequestException({ code: 'BOOKING_POST_UNAVAILABLE', message: 'Post is not available for booking' });
    }
    if (post.expires_at && new Date(post.expires_at).getTime() <= Date.now()) {
      throw new BadRequestException({ code: 'BOOKING_POST_UNAVAILABLE', message: 'Post is not available for booking' });
    }
    if (!post.user) throw new BadRequestException('Post has no owner');
    if (post.user.id === customerId) throw new BadRequestException({ code: 'BOOKING_SELF', message: 'You cannot book your own post' });

    // Only a genuinely unknown category means "not bookable". Swallowing every
    // error here told the customer this category does not support bookings when
    // the truth was that we could not look it up.
    let schema: { has_rental_status?: boolean; label?: string } | null;
    try {
      schema = await this.categoryService.getCategory(post.category);
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      schema = null;
    }
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
    // Two taps on a slow connection race the check above; the partial unique
    // index settles it and we report the same code either way.
    const saved = await this.bookingRepository.save(booking)
      .catch((err) => this.rethrowBookingConflict(err));

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
      // `create` refuses a start date in the past, but a request can sit PENDING
      // until its whole window has gone by. Accepting then would mint a live
      // commitment for dates nobody can honour — and one that counts toward
      // review eligibility and blocks the post from being deleted.
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (new Date(booking.end_date) < today) {
        throw new BadRequestException({ code: 'BOOKING_DATE_PAST', message: 'These dates have already passed' });
      }

      // Refuse overlap with an already-accepted booking on the same post.
      // Advisory-only: two accepts issued at once both passed this and both
      // wrote, leaving one post booked twice for the same days. The exclusion
      // constraint added in 1784334400000 is what actually decides it.
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
    const saved = await this.bookingRepository.save(booking)
      .catch((err) => this.rethrowBookingConflict(err));

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

  /**
   * Date ranges already taken on a post. Customers picked dates blind and only
   * learned about a clash when the provider declined — the windows themselves
   * carry no personal data, so the booking form can grey them out up front.
   */
  async busyRanges(postId: number): Promise<{ start_date: string; end_date: string }[]> {
    const rows = await this.bookingRepository.createQueryBuilder('b')
      .select(['b.start_date AS start_date', 'b.end_date AS end_date'])
      .where('b.postId = :postId AND b.status = :accepted', { postId, accepted: BookingStatus.ACCEPTED })
      .andWhere('b.end_date >= CURRENT_DATE')
      .orderBy('b.start_date', 'ASC')
      .getRawMany();
    const iso = (d: any) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
    return rows.map((r) => ({ start_date: iso(r.start_date), end_date: iso(r.end_date) }));
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

  /**
   * Ages out requests nobody answered.
   *
   * A PENDING booking had no terminal state of its own, so an ignored request
   * lived forever — and because `UQ_booking_one_pending_per_customer_post` is
   * partial on PENDING, it permanently barred that customer from ever asking
   * about that post again. It also sat in the provider's pending count for good.
   *
   * The trigger is the dates running out, not elapsed time: while the requested
   * window is still ahead, the request is live no matter how long it has waited.
   */
  @Cron('15 0 * * *')
  async expireStaleBookings(): Promise<void> {
    try {
      const result = await this.bookingRepository
        .createQueryBuilder()
        .update(Booking)
        .set({ status: BookingStatus.EXPIRED })
        .where('status = :pending AND end_date < CURRENT_DATE', { pending: BookingStatus.PENDING })
        .execute();
      const n = result.affected ?? 0;
      if (n) this.logger.log(`expireStaleBookings: expired ${n} unanswered request(s)`);
    } catch (err) {
      this.logger.error(`expireStaleBookings failed: ${err?.message}`);
    }
  }

  /**
   * Nightly: nudge customers whose accepted rental has ended to leave a
   * review. Each booking is prompted once — the stamp is written before the
   * push so a flaky delivery never turns into a nag.
   */
  @Cron('0 1 * * *')
  async promptReviews(): Promise<void> {
    try {
      const due = await this.bookingRepository
        .createQueryBuilder('b')
        .leftJoin('b.post', 'post').addSelect(['post.id'])
        .leftJoin('b.customer', 'customer').addSelect(['customer.id'])
        .leftJoin('b.provider', 'provider').addSelect(['provider.id'])
        .where('b.status = :accepted', { accepted: BookingStatus.ACCEPTED })
        .andWhere('b.end_date < NOW()')
        .andWhere('b.review_prompted_at IS NULL')
        .getMany();
      if (!due.length) return;

      await this.bookingRepository.update(
        { id: In(due.map((b) => b.id)) },
        { review_prompted_at: new Date() },
      );
      for (const b of due) {
        if (!b.customer?.id || !b.post?.id) continue;
        await this.notifications.notifyUsers(
          [b.customer.id],
          'Үнэлгээ өгөх үү?',
          'Таны түрээс дууслаа. Үйлчилгээ үзүүлэгчийг үнэлж бусдад туслаарай.',
          { type: 'review_prompt', bookingId: b.id, postId: b.post.id, providerId: b.provider?.id },
        );
      }
      this.logger.log(`promptReviews: prompted ${due.length} customer(s)`);
    } catch (err) {
      this.logger.error(`promptReviews failed: ${err?.message}`);
    }
  }

  // Reviews eligibility: has the customer ever had an accepted booking with this provider?
  async hasAcceptedBooking(customerId: string, providerId: string): Promise<boolean> {
    const count = await this.bookingRepository.count({
      where: { customer: { id: customerId }, provider: { id: providerId }, status: BookingStatus.ACCEPTED },
    });
    return count > 0;
  }
}
