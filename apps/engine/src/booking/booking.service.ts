import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager } from 'typeorm';
import {
  bookingValue, countDays, priceForDays, SOCKET_EVENTS,
  type Booking, type BookingList, type BookingValue, type BookingStatus, type BookingUpdatedPayload, type DealRole, type ListingListItem,
  type Message, type MyBookingsTab, type PublicUser, type ReceivedBookingsTab,
} from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { CategoryService } from '../category/category.service';
import { ChatService } from '../chat/chat.service';
import { REALTIME, type RealtimePort } from '../events/realtime';
import { PeopleService } from '../people/people.service';
import { assertDateRange, AvailabilityService, ulaanbaatarDate } from '../post/availability.service';
import { ContactService } from '../post/contact.service';
import { Post } from '../post/entities/post.entity';
import { LISTING_EVENTS, type ListingEventPort } from '../post/listing-events';
import { PostService } from '../post/post.service';
import type { CreateBookingDto } from './booking.dto';

interface BookingRow {
  id: number;
  post_id: number | null;
  customer_id: string;
  provider_id: string;
  post_title: string | null;
  category: string;
  start_date: string;
  end_date: string;
  price_amount: string | null;
  price_unit: string | null;
  message: string | null;
  address: string | null;
  start_time: string | null;
  status: BookingStatus;
  closed_reason: 'OVERLAP' | null;
  response_message: string | null;
  responded_at: Date | null;
  date_created: Date;
  date_updated: Date;
}

/** Dates as `YYYY-MM-DD` text: node-postgres would parse a `date` into a host-timezone Date. */
const COLS = `b.id, b.post_id, b.customer_id, b.provider_id, b.post_title, b.category,
  to_char(b.start_date, 'YYYY-MM-DD') AS start_date, to_char(b.end_date, 'YYYY-MM-DD') AS end_date,
  b.price_amount, b.price_unit, b.message, b.address, b.start_time, b.status, b.closed_reason,
  b.response_message, b.responded_at, b.date_created, b.date_updated`;

/** Each tab's WHERE, with `$2` = today in Ulaanbaatar. */
const MINE_TABS: Record<MyBookingsTab, { where: string; order: string }> = {
  active: { where: `(b.status = 'PENDING' OR (b.status = 'ACCEPTED' AND b.end_date >= $2::date))`, order: 'b.start_date ASC, b.id ASC' },
  past: { where: `NOT (b.status = 'PENDING' OR (b.status = 'ACCEPTED' AND b.end_date >= $2::date))`, order: 'b.start_date DESC, b.id DESC' },
};
const RECEIVED_TABS: Record<ReceivedBookingsTab, { where: string; order: string }> = {
  new: { where: `b.status = 'PENDING'`, order: 'b.date_created DESC, b.id DESC' },
  accepted: { where: `b.status = 'ACCEPTED' AND b.end_date >= $2::date`, order: 'b.start_date ASC, b.id ASC' },
  past: { where: `NOT (b.status = 'PENDING' OR (b.status = 'ACCEPTED' AND b.end_date >= $2::date))`, order: 'b.start_date DESC, b.id DESC' },
};

/** UPDATE … RETURNING through TypeORM answers `[rows, count]`; a SELECT answers the rows. */
const returned = <T>(res: unknown): T[] => {
  const r = res as unknown[];
  return (Array.isArray(r[0]) ? r[0] : r) as T[];
};

const bad = (code: string, message: string): never => {
  throw new BadRequestException({ message, code });
};

type Step = { message: Message; recipient: string };

/**
 * Bookings: a customer asks for days on a rentable listing, its owner accepts or declines.
 * Accepting writes the days to `post_busy` (BOOKED) inside the same transaction, so two accepts
 * racing for the same days fail one with BOOKING_OVERLAP, and any other pending request that
 * overlaps is declined as OVERLAP. Phones are shared only once ACCEPTED. A booking outlives its
 * listing: it can still be declined or cancelled, never accepted.
 */
@Injectable()
export class BookingService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly posts: PostService,
    private readonly categories: CategoryService,
    private readonly availability: AvailabilityService,
    private readonly chat: ChatService,
    private readonly people: PeopleService,
    private readonly contacts: ContactService,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
    @Optional() @Inject(REALTIME) private readonly realtime?: RealtimePort,
  ) {}

  // ---- mapping -------------------------------------------------------------

  private async views(rows: BookingRow[], meId: string, today = ulaanbaatarDate()): Promise<Booking[]> {
    if (rows.length === 0) return [];
    const users = await this.people.publicUsers(rows.flatMap((b) => [b.customer_id, b.provider_id]), 'rating');
    const postIds = [...new Set(rows.map((b) => b.post_id).filter((x): x is number => x !== null))];
    const posts = postIds.length ? (await this.ds.getRepository(Post).findBy({ id: In(postIds) })).filter((p) => !p.deleted_at) : [];
    const contact = new Map(posts.map((p) => [p.id, p.contact_phone]));
    const items = new Map<number, ListingListItem>((await this.posts.items(posts, 'none')).map((it) => [it.id, it]));
    const accepted = rows.filter((b) => b.status === 'ACCEPTED');
    const phones = new Map<string, string>(
      accepted.length
        ? (await this.ds.query<Array<{ id: string; phone_number: string }>>('SELECT id, phone_number FROM users WHERE id = ANY($1::uuid[])', [
            [...new Set(accepted.flatMap((b) => [b.customer_id, b.provider_id]))],
          ])).map((u) => [u.id, u.phone_number])
        : [],
    );
    const threads = await this.chat.idFor(rows.map((b) => b.post_id), rows.map((b) => b.customer_id));
    const reviewed = new Set(
      (await this.ds.query<Array<{ provider_id: string }>>('SELECT provider_id FROM reviews WHERE author_id = $1 AND provider_id = ANY($2::uuid[])', [
        meId, [...new Set(rows.map((b) => b.provider_id))],
      ])).map((r) => r.provider_id),
    );
    const pending = rows.filter((b) => b.status === 'PENDING' && b.provider_id === meId && b.post_id !== null).map((b) => b.id);
    const conflicts = new Map<number, number[]>();
    if (pending.length) {
      const pairs = await this.ds.query<Array<{ id: number; other: number }>>(
        `SELECT a.id, o.id AS other FROM bookings a JOIN bookings o
            ON o.post_id = a.post_id AND o.id <> a.id AND o.status = 'PENDING'
           AND daterange(o.start_date, o.end_date, '[]') && daterange(a.start_date, a.end_date, '[]')
         WHERE a.id = ANY($1::int[]) ORDER BY o.id`,
        [pending],
      );
      for (const p of pairs) conflicts.set(p.id, [...(conflicts.get(p.id) ?? []), p.other]);
    }
    const blank = (id: string): PublicUser => ({ id, type: null, phone_number: null, parent_name: null, given_name: null, email: null, profile_picture: null, is_verified: null, date_created: new Date(0).toISOString() });
    return rows.map((b) => {
      const role: DealRole = b.customer_id === meId ? 'CUSTOMER' : 'PROVIDER';
      const days = countDays(b.start_date, b.end_date);
      let phone: string | null = null;
      if (b.status === 'ACCEPTED') {
        phone = role === 'CUSTOMER' ? ((b.post_id !== null ? contact.get(b.post_id) : null) ?? phones.get(b.provider_id) ?? null) : (phones.get(b.customer_id) ?? null);
      }
      return {
        id: b.id,
        post_id: b.post_id,
        post: b.post_id !== null ? (items.get(b.post_id) ?? null) : null,
        post_title: b.post_title,
        category: b.category,
        role,
        customer: users.get(b.customer_id) ?? blank(b.customer_id),
        provider: users.get(b.provider_id) ?? blank(b.provider_id),
        start_date: b.start_date,
        end_date: b.end_date,
        days,
        price_amount: b.price_amount,
        price_unit: b.price_unit,
        total: priceForDays(b.price_amount, b.price_unit, days),
        message: b.message,
        address: b.address,
        start_time: b.start_time,
        status: b.status,
        closed_reason: b.closed_reason,
        response_message: b.response_message,
        responded_at: b.responded_at?.toISOString() ?? null,
        contact_phone: phone,
        conversation_id: b.post_id !== null ? (threads.get(`${String(b.post_id)}:${b.customer_id}`) ?? null) : null,
        can_review: role === 'CUSTOMER' && b.status === 'ACCEPTED' && b.end_date < today && !reviewed.has(b.provider_id),
        conflicts: conflicts.get(b.id) ?? [],
        date_created: b.date_created.toISOString(),
        date_updated: b.date_updated.toISOString(),
      };
    });
  }

  private async loadRow(id: number, em?: EntityManager, lock = false): Promise<BookingRow> {
    const rows = await (em ?? this.ds.manager).query<BookingRow[]>(`SELECT ${COLS} FROM bookings b WHERE b.id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
    const row = rows.at(0);
    if (!row) throw new NotFoundException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    return row;
  }

  private assertParty(b: BookingRow, me: RequestUser): void {
    if (b.customer_id !== me.id && b.provider_id !== me.id) {
      throw new ForbiddenException({ message: 'Not your booking', code: 'BOOKING_NOT_YOURS' });
    }
  }

  private async one(id: number, me: RequestUser): Promise<Booking> {
    const [view] = await this.views([await this.loadRow(id)], me.id);
    return view;
  }

  /** After commit: the thread messages, the other side's socket refresh, the notification event. */
  private announce(b: BookingRow, steps: Step[], type: 'booking.requested' | 'booking.accepted' | 'booking.declined' | 'booking.cancelled', to: string): void {
    for (const s of steps) this.chat.deliver(s.recipient, s.message, '');
    const role: DealRole = to === b.customer_id ? 'CUSTOMER' : 'PROVIDER';
    this.realtime?.toUser(to, SOCKET_EVENTS.BOOKING_UPDATED, { booking_id: b.id, status: b.status, role } satisfies BookingUpdatedPayload);
    this.events.emit({ type, booking_id: b.id, post_id: b.post_id, user_id: to, title: b.post_title });
  }

  // ---- reads ---------------------------------------------------------------

  async get(me: RequestUser, id: number): Promise<Booking> {
    const row = await this.loadRow(id);
    this.assertParty(row, me);
    return (await this.views([row], me.id))[0];
  }

  private async page<Tab extends string>(
    me: RequestUser, side: 'customer_id' | 'provider_id', tabs: Record<Tab, { where: string; order: string }>, tab: Tab, page: number, limit: number,
  ): Promise<BookingList<Tab>> {
    const today = ulaanbaatarDate();
    const t = tabs[tab];
    // `$2::date IS NOT NULL` types $2 for the tabs that never read it.
    const rows = await this.ds.query<BookingRow[]>(
      `SELECT ${COLS} FROM bookings b WHERE b.${side} = $1 AND $2::date IS NOT NULL AND ${t.where} ORDER BY ${t.order} LIMIT $3 OFFSET $4`,
      [me.id, today, limit, (page - 1) * limit],
    );
    const keys = Object.keys(tabs) as Tab[];
    const n = await this.ds.query<Array<Record<string, number>>>(
      `SELECT ${keys.map((k, i) => `COUNT(*) FILTER (WHERE ${tabs[k].where})::int AS c${String(i)}`).join(', ')}
         FROM bookings b WHERE b.${side} = $1 AND $2::date IS NOT NULL`,
      [me.id, today],
    );
    const counts = Object.fromEntries(keys.map((k, i) => [k, n[0]?.[`c${String(i)}`] ?? 0])) as Record<Tab, number>;
    return { items: await this.views(rows, me.id, today), total: counts[tab], counts };
  }

  /** `GET /bookings/mine`: what the caller asked for. */
  mine(me: RequestUser, tab: MyBookingsTab, page = 1, limit = 20): Promise<BookingList<MyBookingsTab>> {
    return this.page(me, 'customer_id', MINE_TABS, tab, page, limit);
  }

  /** `GET /bookings/received`: requests on the caller's listings. */
  received(me: RequestUser, tab: ReceivedBookingsTab, page = 1, limit = 20): Promise<BookingList<ReceivedBookingsTab>> {
    return this.page(me, 'provider_id', RECEIVED_TABS, tab, page, limit);
  }

  /**
   * `GET /bookings/value?month=YYYY-MM` (E16): accepted bookings starting that month on the
   * caller's listings and what they are worth (`bookingValue`). Customers pay providers
   * directly, so this is booking value, never income.
   */
  async value(me: RequestUser, month = ulaanbaatarDate().slice(0, 7)): Promise<BookingValue> {
    const rows = await this.ds.query<BookingRow[]>(
      `SELECT ${COLS} FROM bookings b
        WHERE b.provider_id = $1 AND b.status = 'ACCEPTED'
          AND b.start_date >= ($2 || '-01')::date AND b.start_date < (($2 || '-01')::date + interval '1 month')
        ORDER BY b.start_date DESC, b.id DESC`,
      [me.id, month],
    );
    const items = await this.views(rows, me.id);
    return { month, total: items.reduce((n, b) => n + bookingValue(b), 0), count: items.length, items };
  }

  // ---- writes --------------------------------------------------------------

  /** `POST /bookings`. */
  async create(me: RequestUser, dto: CreateBookingDto): Promise<Booking> {
    assertDateRange(dto.start_date, dto.end_date);
    const post = await this.posts.loadPost(dto.post_id);
    if (!this.posts.isLive(post)) bad('BOOKING_POST_UNAVAILABLE', 'Listing is not available for booking');
    const category = await this.categories.get(post.category);
    if (!category.has_rental_status) bad('BOOKING_CATEGORY_UNSUPPORTED', 'This category does not take bookings');
    if (!post.user_id) bad('POST_HAS_NO_OWNER', 'Listing has no owner');
    if (post.user_id === me.id) bad('BOOKING_SELF', 'Cannot book your own listing');
    if (dto.start_date < ulaanbaatarDate()) bad('BOOKING_DATE_PAST', 'The start date is in the past');
    const busy = await this.availability.busy(post.id, dto.start_date, dto.end_date);
    if (busy.busy.length) bad('BOOKING_DAYS_BUSY', 'The listing is busy on some of those days');

    const providerId = post.user_id as string;
    const { row, step } = await this.ds.transaction(async (em) => {
      let id: number;
      try {
        const ins = await em.query<Array<{ id: number }>>(
          `INSERT INTO bookings (post_id, customer_id, provider_id, post_title, category, start_date, end_date, price_amount, price_unit, message, address, start_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
          [post.id, me.id, providerId, post.title, post.category, dto.start_date, dto.end_date, post.price_amount, post.price_unit,
            dto.message?.trim() || null, dto.address?.trim() || null, dto.start_time ?? null],
        );
        id = ins[0].id;
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          throw new ConflictException({ message: 'You already have a pending request for this listing', code: 'BOOKING_ALREADY_PENDING' });
        }
        throw e;
      }
      await this.contacts.record(post.id, 'BOOKING', me.id, null, em);
      const s = await this.chat.bookingStep(em, post, me.id, me.id, 'BOOKING_REQUESTED', id);
      return { row: await this.loadRow(id, em), step: s };
    });
    this.announce(row, [step], 'booking.requested', providerId);
    return this.one(row.id, me);
  }

  /** `PUT /bookings/:id/accept`: the listing's owner, PENDING only. */
  async accept(me: RequestUser, id: number, response?: string): Promise<Booking> {
    const { row, steps, declined } = await this.ds.transaction(async (em) => {
      // Accepts on one listing run one at a time: the post row is the lock. Without it two accepts
      // each hold their booking and wait on the other's (the overlap decline) and Postgres kills one.
      const peek = await this.loadRow(id, em);
      if (peek.post_id !== null) await em.query('SELECT id FROM posts WHERE id = $1 FOR UPDATE', [peek.post_id]);
      const b = await this.loadRow(id, em, true);
      if (b.provider_id !== me.id) throw new ForbiddenException({ message: 'Not your booking', code: 'BOOKING_NOT_YOURS' });
      if (b.status !== 'PENDING') bad('BOOKING_NOT_PENDING', 'This booking is no longer pending');
      const post = b.post_id !== null ? await em.getRepository(Post).findOne({ where: { id: b.post_id } }) : null;
      if (!post || post.deleted_at) bad('BOOKING_POST_REMOVED', 'The listing was removed');
      if (b.start_date < ulaanbaatarDate()) bad('BOOKING_DATE_PAST', 'The start date is in the past');
      const live = post as Post;
      await this.availability.book(em, live.id, b.id, b.start_date, b.end_date);
      await em.query(
        `UPDATE bookings SET status = 'ACCEPTED', response_message = $2, responded_at = now(), date_updated = now() WHERE id = $1`,
        [b.id, response?.trim() || null],
      );
      const out: Step[] = [await this.chat.bookingStep(em, live, b.customer_id, me.id, 'BOOKING_ACCEPTED', b.id)];
      const others = returned<{ id: number }>(await em.query(
        `UPDATE bookings o SET status = 'DECLINED', closed_reason = 'OVERLAP', responded_at = now(), date_updated = now()
          WHERE o.post_id = $1 AND o.status = 'PENDING' AND o.id <> $2
            AND daterange(o.start_date, o.end_date, '[]') && daterange($3::date, $4::date, '[]')
          RETURNING o.id`,
        [live.id, b.id, b.start_date, b.end_date],
      ));
      const closed: BookingRow[] = [];
      for (const o of others) {
        const r = await this.loadRow(o.id, em);
        closed.push(r);
        out.push(await this.chat.bookingStep(em, live, r.customer_id, me.id, 'BOOKING_DECLINED', r.id));
      }
      return { row: await this.loadRow(b.id, em), steps: out, declined: closed };
    });
    this.announce(row, steps, 'booking.accepted', row.customer_id);
    for (const d of declined) this.announce(d, [], 'booking.declined', d.customer_id);
    return this.one(row.id, me);
  }

  /** `PUT /bookings/:id/decline`: the listing's owner, PENDING only; works on a removed listing too. */
  async decline(me: RequestUser, id: number, response?: string): Promise<Booking> {
    const { row, step } = await this.ds.transaction(async (em) => {
      const b = await this.loadRow(id, em, true);
      if (b.provider_id !== me.id) throw new ForbiddenException({ message: 'Not your booking', code: 'BOOKING_NOT_YOURS' });
      if (b.status !== 'PENDING') bad('BOOKING_NOT_PENDING', 'This booking is no longer pending');
      await em.query(
        `UPDATE bookings SET status = 'DECLINED', response_message = $2, responded_at = now(), date_updated = now() WHERE id = $1`,
        [b.id, response?.trim() || null],
      );
      return { row: await this.loadRow(b.id, em), step: await this.stepIfListed(em, b, me.id, 'BOOKING_DECLINED') };
    });
    this.announce(row, step ? [step] : [], 'booking.declined', row.customer_id);
    return this.one(row.id, me);
  }

  /** `PUT /bookings/:id/cancel`: the customer, while PENDING or before an ACCEPTED booking starts; frees its days. */
  async cancel(me: RequestUser, id: number): Promise<Booking> {
    const { row, step } = await this.ds.transaction(async (em) => {
      const b = await this.loadRow(id, em, true);
      if (b.customer_id !== me.id) throw new ForbiddenException({ message: 'Not your booking', code: 'BOOKING_NOT_YOURS' });
      const cancellable = b.status === 'PENDING' || (b.status === 'ACCEPTED' && b.start_date > ulaanbaatarDate());
      if (!cancellable) bad('BOOKING_NOT_CANCELLABLE', 'This booking can no longer be cancelled');
      await em.query(`UPDATE bookings SET status = 'CANCELLED', date_updated = now() WHERE id = $1`, [b.id]);
      await em.query(`DELETE FROM post_busy WHERE booking_id = $1`, [b.id]);
      return { row: await this.loadRow(b.id, em), step: await this.stepIfListed(em, b, me.id, 'BOOKING_CANCELLED') };
    });
    this.announce(row, step ? [step] : [], 'booking.cancelled', row.provider_id);
    return this.one(row.id, me);
  }

  /** A thread step needs the listing (threads key on it); a removed listing gets none. */
  private async stepIfListed(em: EntityManager, b: BookingRow, senderId: string, kind: 'BOOKING_DECLINED' | 'BOOKING_CANCELLED'): Promise<Step | null> {
    if (b.post_id === null) return null;
    const post = await em.getRepository(Post).findOne({ where: { id: b.post_id } });
    if (!post?.user_id) return null;
    return this.chat.bookingStep(em, post, b.customer_id, senderId, kind, b.id);
  }

  // ---- scheduled -----------------------------------------------------------

  /** PENDING requests whose first day has passed. Returns how many. */
  async expireStale(today = ulaanbaatarDate()): Promise<number> {
    const list = returned<BookingRow>(await this.ds.query(
      `UPDATE bookings b SET status = 'EXPIRED', date_updated = now() WHERE b.status = 'PENDING' AND b.start_date < $1::date
       RETURNING b.id, b.post_id, b.customer_id, b.post_title`,
      [today],
    ));
    for (const r of list) this.events.emit({ type: 'booking.expired', booking_id: r.id, post_id: r.post_id, user_id: r.customer_id, title: r.post_title });
    return list.length;
  }

  /** 18:00 the evening before an ACCEPTED booking starts: one reminder to each side, stamped so it never repeats. */
  async remindTomorrow(now = new Date()): Promise<number> {
    const tomorrow = ulaanbaatarDate(1, now);
    const res = returned<{ id: number; post_id: number | null; customer_id: string; provider_id: string; post_title: string | null; start_time: string | null; address: string | null }>(await this.ds.query(
      `UPDATE bookings SET reminded_at = $2 WHERE status = 'ACCEPTED' AND start_date = $1::date AND reminded_at IS NULL
       RETURNING id, post_id, customer_id, provider_id, post_title, start_time, address`,
      [tomorrow, now],
    ));
    for (const r of res) {
      for (const user of [r.customer_id, r.provider_id]) {
        this.events.emit({ type: 'booking.reminder', booking_id: r.id, post_id: r.post_id, user_id: user, title: r.post_title, start_date: tomorrow, start_time: r.start_time, address: r.address });
      }
    }
    return res.length;
  }

  /** Finished ACCEPTED bookings whose customer has not reviewed the provider: one prompt each. */
  async promptReviews(today = ulaanbaatarDate()): Promise<number> {
    const res = returned<{ id: number; customer_id: string; provider_id: string; post_title: string | null }>(await this.ds.query(
      `UPDATE bookings b SET review_prompted_at = now()
        WHERE b.status = 'ACCEPTED' AND b.end_date < $1::date AND b.review_prompted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.provider_id = b.provider_id AND r.author_id = b.customer_id)
       RETURNING b.id, b.customer_id, b.provider_id, b.post_title`,
      [today],
    ));
    for (const r of res) this.events.emit({ type: 'booking.review_prompt', booking_id: r.id, user_id: r.customer_id, provider_id: r.provider_id, title: r.post_title });
    return res.length;
  }
}
