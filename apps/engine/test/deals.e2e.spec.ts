/**
 * Phase 5: book, Чат, review, between real accounts. The "done when" of the phase: a booking
 * request, its acceptance and a review complete between two accounts. Also the carried-over
 * rules: rentals only, no self-booking, one pending request per customer per listing, no overlap
 * with an accepted booking, phones only after acceptance, a booking outlives its listing, review
 * after a finished booking or an answered thread.
 */
import '../src/config/load-env';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type {
  Booking, BookingList, Conversation, ConversationOpenResponse, Listing, Message, MyBookingsTab, ProviderReviews,
  ReceivedBookingsTab, Review, SellerProfile,
} from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { BookingModule } from '../src/booking/booking.module';
import { BookingService } from '../src/booking/booking.service';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { ChatModule } from '../src/chat/chat.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { addDays, ulaanbaatarDate } from '../src/post/availability.service';
import { InMemoryListingEvents, LISTING_EVENTS, type ListingEvent } from '../src/post/listing-events';
import { PostModule } from '../src/post/post.module';
import { RedisModule } from '../src/redis/redis.module';
import { ReviewModule } from '../src/review/review.module';
import { UserModule } from '../src/user/user.module';

let app: INestApplication;
let ds: DataSource;
let cfg: AuthConfig;
const events: ListingEvent[] = [];
const phones = Array.from({ length: 4 }, () => `7${String(randomInt(1_000_000, 10_000_000))}`);
const ids: Record<'provider' | 'customer' | 'other' | 'stranger', string> = { provider: '', customer: '', other: '', stranger: '' };
const auth: Record<keyof typeof ids, { Authorization: string }> = {} as never;
let rental: number;
let rental2: number;
let shop: number;
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);
const body = (res: { body: unknown }): Record<string, unknown> => res.body as Record<string, unknown>;
const day = (n: number): string => addDays(ulaanbaatarDate(), n);

async function insertPost(title: string, category: string, subcategory: string, price: number | null, unit: string | null): Promise<number> {
  const rows = await ds.query<Array<{ id: number }>>(
    `INSERT INTO posts (user_id, title, category, subcategory, province, price_amount, price_unit, contact_phone, approval_status, status)
     VALUES ($1, $2, $3, $4, 'ULAANBAATAR', $5, $6, '88112233', 'APPROVED', 'ACTIVE') RETURNING id`,
    [ids.provider, title, category, subcategory, price, unit],
  );
  return rows[0].id;
}

const book = (who: keyof typeof ids, postId: number, from: number, to: number, extra: Record<string, unknown> = {}) =>
  http().post('/api/bookings').set(auth[who]).send({ post_id: postId, start_date: day(from), end_date: day(to), ...extra });

beforeAll(async () => {
  cfg = { ...authConfigFromEnv(), devMode: true, adminPhones: [] };
  const bus = new InMemoryListingEvents();
  bus.subscribe((e) => events.push(e));
  const mod = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }),
      RedisModule, AuthModule, UserModule, CategoryModule, PostModule, ChatModule, BookingModule, ReviewModule,
    ],
  })
    .overrideProvider(AUTH_CONFIG).useValue(cfg)
    .overrideProvider(LISTING_EVENTS).useValue(bus)
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  await app.get(CategoryService).seed();
  const rows = await ds.query<Array<{ id: string; phone_number: string }>>(
    `INSERT INTO users (phone_number, is_verified, type, given_name) VALUES
       ($1, true, 'PROVIDER', 'Бат-Эрдэнэ'), ($2, true, 'CUSTOMER', 'Ганбат'), ($3, true, 'CUSTOMER', 'Сарантуяа'), ($4, true, 'CUSTOMER', 'Төмөр')
     RETURNING id, phone_number`,
    phones,
  );
  const byPhone = new Map(rows.map((r) => [r.phone_number, r.id]));
  for (const [i, k] of (['provider', 'customer', 'other', 'stranger'] as const).entries()) {
    ids[k] = byPhone.get(phones[i]) as string;
    auth[k] = { Authorization: `Bearer ${await openSession(ds, ids[k], cfg)}` };
  }
  rental = await insertPost('Komatsu PC200 экскаватор', 'machineryrent', 'excavator', 450000, 'DAY');
  rental2 = await insertPost('Кран 25 тн', 'machineryrent', 'crane', 1200000, 'DAY');
  shop = await insertPost('Хөтөл цемент', 'materialstore', 'cement', 20000, null);
});

afterAll(async () => {
  const all = Object.values(ids);
  await ds.query('DELETE FROM reviews WHERE provider_id = ANY($1::uuid[]) OR author_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM conversations WHERE customer_id = ANY($1::uuid[]) OR provider_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM bookings WHERE customer_id = ANY($1::uuid[]) OR provider_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM posts WHERE user_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [all]);
  await app.close();
});

describe('booking rules', () => {
  it('refuses the wrong category, self-booking, past days and a missing listing', async () => {
    expect(body(await book('customer', shop, 1, 2).expect(400)).code).toBe('BOOKING_CATEGORY_UNSUPPORTED');
    expect(body(await book('provider', rental, 1, 2).expect(400)).code).toBe('BOOKING_SELF');
    expect(body(await book('customer', rental, -2, 1).expect(400)).code).toBe('BOOKING_DATE_PAST');
    expect(body(await book('customer', rental, 3, 1).expect(400)).code).toBe('INVALID_DATE_RANGE');
    await book('customer', 999999999, 1, 2).expect(404);
    await http().post('/api/bookings').send({ post_id: rental, start_date: day(1), end_date: day(2) }).expect(401);
    await book('customer', rental, 1, 2, { start_time: '25:00' }).expect(400);
  });

  it('a request carries the price snapshot, no phone, and opens the thread with a booking step', async () => {
    const b = (await book('customer', rental, 10, 12, { message: 'Оператортой', address: 'Хан-Уул, 19-р хороолол', start_time: '08:00' }).expect(201)).body as Booking;
    expect(b).toMatchObject({ status: 'PENDING', role: 'CUSTOMER', days: 3, total: 1350000, price_unit: 'DAY', contact_phone: null, start_time: '08:00', address: 'Хан-Уул, 19-р хороолол' });
    expect(b.provider.phone_number).toBeNull();
    expect(b.conversation_id).toBeTruthy();
    const msgs = (await http().get(`/api/conversations/${b.conversation_id as string}/messages`).set(auth.provider).expect(200)).body as Message[];
    expect(msgs.map((m) => m.kind)).toEqual(['BOOKING_REQUESTED']);
    expect(events.some((e) => e.type === 'booking.requested' && e.user_id === ids.provider)).toBe(true);
    // One pending request per customer per listing.
    expect(body(await book('customer', rental, 20, 21).expect(409)).code).toBe('BOOKING_ALREADY_PENDING');
    // The detail tells that customer (and nobody else) about the open request.
    expect((await http().get(`/api/posts/${rental}`).set(auth.customer).expect(200)).body).toMatchObject({ my_pending_booking_id: b.id });
    expect((await http().get(`/api/posts/${rental}`).set(auth.other).expect(200)).body).toMatchObject({ my_pending_booking_id: null });
    expect((await http().get(`/api/posts/${rental}`).expect(200)).body).toMatchObject({ my_pending_booking_id: null });
  });

  it('accept writes BOOKED days, shares phones, and declines an overlapping request as OVERLAP', async () => {
    const mine = (await http().get('/api/bookings/mine').set(auth.customer).expect(200)).body as BookingList<MyBookingsTab>;
    const first = mine.items[0];
    const rival = (await book('other', rental, 11, 13).expect(201)).body as Booking;
    const separate = (await book('stranger', rental, 14, 15).expect(201)).body as Booking;

    const received = (await http().get('/api/bookings/received?tab=new').set(auth.provider).expect(200)).body as BookingList<ReceivedBookingsTab>;
    expect(received.counts.new).toBe(3);
    expect(received.items.find((x) => x.id === first.id)?.conflicts).toEqual([rival.id]);
    expect(received.items.find((x) => x.id === separate.id)?.conflicts).toEqual([]);

    // Only the owner answers.
    expect(body(await http().put(`/api/bookings/${String(first.id)}/accept`).set(auth.customer).expect(403)).code).toBe('BOOKING_NOT_YOURS');
    const accepted = (await http().put(`/api/bookings/${String(first.id)}/accept`).set(auth.provider).send({ response_message: 'Боломжтой' }).expect(200)).body as Booking;
    expect(accepted).toMatchObject({ status: 'ACCEPTED', role: 'PROVIDER', response_message: 'Боломжтой', contact_phone: phones[1] });

    const customerView = (await http().get(`/api/bookings/${String(first.id)}`).set(auth.customer).expect(200)).body as Booking;
    expect(customerView.contact_phone).toBe('88112233');

    const rivalNow = (await http().get(`/api/bookings/${String(rival.id)}`).set(auth.other).expect(200)).body as Booking;
    expect(rivalNow).toMatchObject({ status: 'DECLINED', closed_reason: 'OVERLAP' });
    expect(body(await http().get(`/api/bookings/${String(separate.id)}`).set(auth.stranger).expect(200)).status).toBe('PENDING');
    expect(body(await http().put(`/api/bookings/${String(first.id)}/accept`).set(auth.provider).expect(400)).code).toBe('BOOKING_NOT_PENDING');
    await http().get(`/api/bookings/${String(first.id)}`).set(auth.stranger).expect(403);

    // The days are busy now: browse by those dates leaves it out, and a new request on them is refused.
    const avail = (await http().get(`/api/posts/${String(rental)}/availability?from=${day(10)}&to=${day(12)}`).expect(200)).body as { busy: Array<{ kind: string }> };
    expect(avail.busy.map((b) => b.kind)).toEqual(['BOOKED']);
    expect(body(await book('other', rental, 12, 13).expect(400)).code).toBe('BOOKING_DAYS_BUSY');
  });

  it('two accepts racing for the same days: exactly one wins', async () => {
    const a = (await book('customer', rental2, 5, 6).expect(201)).body as Booking;
    const b = (await book('other', rental2, 6, 7).expect(201)).body as Booking;
    const svc = app.get(BookingService);
    const me = { id: ids.provider, phone_number: phones[0], type: 'PROVIDER' as const, is_admin: false, session_id: '' };
    const results = await Promise.allSettled([svc.accept(me, a.id), svc.accept(me, b.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const statuses = await ds.query<Array<{ status: string }>>('SELECT status FROM bookings WHERE id = ANY($1::int[]) ORDER BY id', [[a.id, b.id]]);
    expect(statuses.map((s) => s.status).sort()).toEqual(['ACCEPTED', 'DECLINED']);
    const booked = await ds.query<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n FROM post_busy WHERE post_id = $1 AND kind = 'BOOKED'`, [rental2]);
    expect(booked[0].n).toBe(1);
  });

  it('cancel frees the days; decline and cancel still work once the listing is gone, accept does not', async () => {
    const pending = (await http().get('/api/bookings/mine?tab=active').set(auth.stranger).expect(200)).body as BookingList<MyBookingsTab>;
    const sep = pending.items[0];
    await http().put(`/api/bookings/${String(sep.id)}/accept`).set(auth.provider).expect(200);
    const cancelled = (await http().put(`/api/bookings/${String(sep.id)}/cancel`).set(auth.stranger).expect(200)).body as Booking;
    expect(cancelled.status).toBe('CANCELLED');
    const busy = await ds.query<Array<{ n: number }>>('SELECT COUNT(*)::int AS n FROM post_busy WHERE booking_id = $1', [sep.id]);
    expect(busy[0].n).toBe(0);
    expect(body(await http().put(`/api/bookings/${String(sep.id)}/cancel`).set(auth.stranger).expect(400)).code).toBe('BOOKING_NOT_CANCELLABLE');

    const gone = await insertPost('Устах кран', 'machineryrent', 'crane', 100000, 'DAY');
    const x = (await book('stranger', gone, 3, 4).expect(201)).body as Booking;
    const y = (await book('other', gone, 8, 9).expect(201)).body as Booking;
    await ds.query('UPDATE posts SET deleted_at = now() WHERE id = $1', [gone]);
    expect(body(await http().put(`/api/bookings/${String(x.id)}/accept`).set(auth.provider).expect(400)).code).toBe('BOOKING_POST_REMOVED');
    expect(body(await http().put(`/api/bookings/${String(x.id)}/decline`).set(auth.provider).expect(200)).status).toBe('DECLINED');
    const yv = (await http().put(`/api/bookings/${String(y.id)}/cancel`).set(auth.other).expect(200)).body as Booking;
    expect(yv).toMatchObject({ status: 'CANCELLED', post: null, post_title: 'Устах кран' });
  });

  it('crons: stale requests expire, tomorrow is reminded once, a finished booking prompts a review', async () => {
    const svc = app.get(BookingService);
    const stale = (await book('stranger', rental2, 20, 20).expect(201)).body as Booking;
    expect(await svc.expireStale(day(21))).toBeGreaterThanOrEqual(1);
    expect(body(await http().get(`/api/bookings/${String(stale.id)}`).set(auth.stranger).expect(200)).status).toBe('EXPIRED');

    const accepted = await ds.query<Array<{ id: number; start_date: string }>>(
      `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date FROM bookings WHERE post_id = $1 AND status = 'ACCEPTED'`, [rental],
    );
    const eve = new Date(`${addDays(accepted[0].start_date, -1)}T10:00:00Z`); // 18:00 in Ulaanbaatar
    events.length = 0;
    expect(await svc.remindTomorrow(eve)).toBe(1);
    expect(await svc.remindTomorrow(eve)).toBe(0);
    expect(events.filter((e) => e.type === 'booking.reminder').map((e) => e.user_id).sort()).toEqual([ids.provider, ids.customer].sort());

    expect(await svc.promptReviews(day(30))).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === 'booking.review_prompt' && e.user_id === ids.customer)).toBe(true);
  });
});

describe('Чат', () => {
  let thread: string;

  it('opens one thread per listing and customer, refuses self-contact', async () => {
    const a = (await http().post('/api/conversations').set(auth.stranger).send({ post_id: rental2 }).expect(200)).body as ConversationOpenResponse;
    const b = (await http().post('/api/conversations').set(auth.stranger).send({ post_id: rental2, body: 'Маргааш боломжтой юу?' }).expect(200)).body as ConversationOpenResponse;
    expect(b.conversation.id).toBe(a.conversation.id);
    expect(b.message?.body).toBe('Маргааш боломжтой юу?');
    expect(b.conversation).toMatchObject({ role: 'CUSTOMER', last_message_mine: true, unread: 0 });
    thread = a.conversation.id;
    expect(body(await http().post('/api/conversations').set(auth.provider).send({ post_id: rental2 }).expect(400)).code).toBe('CANNOT_MESSAGE_SELF');
    expect(body(await http().post(`/api/conversations/${thread}/messages`).set(auth.stranger).send({ body: '   ' }).expect(400)).code).toBe('EMPTY_MESSAGE');
    await http().post(`/api/conversations/${thread}/messages`).set(auth.stranger).send({ body: 'x'.repeat(2001) }).expect(400);
    expect(body(await http().get(`/api/conversations/${thread}`).set(auth.other).expect(403)).code).toBe('NOT_A_PARTICIPANT');
  });

  it('counts unread for the recipient, marks read, pages newest first', async () => {
    const inbox = (await http().get('/api/conversations').set(auth.provider).expect(200)).body as Conversation[];
    const row = inbox.find((c) => c.id === thread) as Conversation;
    // The booking request this customer sent earlier is in the same thread, so two unread.
    expect(row).toMatchObject({ role: 'PROVIDER', unread: 2, last_message_preview: 'Маргааш боломжтой юу?' });
    expect(row.other.given_name).toBe('Төмөр');
    expect(row.other.phone_number).toBeNull();
    await http().put(`/api/conversations/${thread}/read`).set(auth.provider).expect(200);
    const after = (await http().get(`/api/conversations/${thread}`).set(auth.provider).expect(200)).body as Conversation;
    expect(after.unread).toBe(0);

    for (let i = 0; i < 31; i++) await http().post(`/api/conversations/${thread}/messages`).set(auth.stranger).send({ body: `м${String(i)}` });
    const page1 = (await http().get(`/api/conversations/${thread}/messages`).set(auth.provider).expect(200)).body as Message[];
    expect(page1).toHaveLength(30);
    expect(page1[0].body).toBe('м30');
    const last = page1[29];
    const page2 = (await http().get(`/api/conversations/${thread}/messages?before=${encodeURIComponent(last.date_created)}&before_id=${last.id}`).set(auth.provider).expect(200)).body as Message[];
    expect(page2.map((m) => m.body)).toEqual(['м0', 'Маргааш боломжтой юу?', '']);
    expect(page2[2].kind).toBe('BOOKING_REQUESTED');
  });

  it('the provider’s first typed reply sets reply time; booking steps never do', async () => {
    const before = await ds.query<Array<{ first_reply_at: Date | null }>>('SELECT first_reply_at FROM conversations WHERE id = $1', [thread]);
    expect(before[0].first_reply_at).toBeNull();
    await http().post(`/api/conversations/${thread}/messages`).set(auth.provider).send({ body: 'Боломжтой.' }).expect(201);
    const after = await ds.query<Array<{ first_reply_at: Date | null }>>('SELECT first_reply_at FROM conversations WHERE id = $1', [thread]);
    expect(after[0].first_reply_at).not.toBeNull();
    // Replying reads the thread: no unread left for the provider, the customer's messages are read.
    const view = body(await http().get(`/api/conversations/${thread}`).set(auth.provider).expect(200));
    expect(view.unread).toBe(0);
    const theirs = (await http().get(`/api/conversations/${thread}/messages`).set(auth.stranger).expect(200)).body as Message[];
    expect(theirs.filter((m) => m.sender_id === ids.stranger).every((m) => m.read_at !== null)).toBe(true);
    // The customer's thread from the booking has only a booking step from the provider: not a reply.
    const c = await ds.query<Array<{ first_reply_at: Date | null }>>('SELECT first_reply_at FROM conversations WHERE post_id = $1 AND customer_id = $2', [rental, ids.customer]);
    expect(c[0].first_reply_at).toBeNull();
  });

  it('reply time shows on the listing only from three answered threads', async () => {
    const detail = (await http().get(`/api/posts/${String(rental)}`).expect(200)).body as Listing;
    expect(detail.user?.reply_minutes).toBeNull();
    for (const who of ['customer', 'other'] as const) {
      const open = (await http().post('/api/conversations').set(auth[who]).send({ post_id: rental2, body: 'Сайн байна уу' }).expect(200)).body as ConversationOpenResponse;
      await ds.query(`UPDATE conversations SET first_customer_at = now() - interval '2 hours' WHERE id = $1`, [open.conversation.id]);
      await http().post(`/api/conversations/${open.conversation.id}/messages`).set(auth.provider).send({ body: 'Сайн' }).expect(201);
    }
    await ds.query(`UPDATE conversations SET first_customer_at = first_reply_at - interval '30 minutes' WHERE id = $1`, [thread]);
    const now = (await http().get(`/api/posts/${String(rental)}`).expect(200)).body as Listing;
    expect(now.user?.reply_minutes).toBe(120);
  });
});

describe('reviews', () => {
  it('needs a finished booking or an answered thread', async () => {
    // `other` was answered in Чат above; a fresh account has neither.
    const fresh = await ds.query<Array<{ id: string }>>(`INSERT INTO users (phone_number, type) VALUES ($1, 'CUSTOMER') RETURNING id`, [`6${String(randomInt(1_000_000, 10_000_000))}`]);
    const freshAuth = { Authorization: `Bearer ${await openSession(ds, fresh[0].id, cfg)}` };
    expect(body(await http().post('/api/reviews').set(freshAuth).send({ provider_id: ids.provider, rating: 5 }).expect(403)).code).toBe('REVIEW_NEEDS_BOOKING');
    await ds.query('DELETE FROM users WHERE id = $1', [fresh[0].id]);
    expect(body(await http().post('/api/reviews').set(auth.provider).send({ provider_id: ids.provider, rating: 5 }).expect(400)).code).toBe('REVIEW_SELF');
    await http().post('/api/reviews').set(auth.other).send({ provider_id: ids.provider, rating: 6 }).expect(400);
  });

  it('a finished booking: write, edit (one per author), the provider replies once, ratings reach the cards', async () => {
    // The customer's accepted booking ends in the future; move it into the past.
    await ds.query(`UPDATE bookings SET start_date = start_date - 40, end_date = end_date - 40 WHERE customer_id = $1 AND status = 'ACCEPTED'`, [ids.customer]);
    const past = (await http().get('/api/bookings/mine?tab=past').set(auth.customer).expect(200)).body as BookingList<MyBookingsTab>;
    expect(past.items.find((b) => b.status === 'ACCEPTED')?.can_review).toBe(true);

    const r1 = (await http().post('/api/reviews').set(auth.customer).send({ provider_id: ids.provider, rating: 4, comment: 'Цагтаа ирсэн.' }).expect(201)).body as Review;
    const r2 = (await http().post('/api/reviews').set(auth.customer).send({ provider_id: ids.provider, rating: 5, comment: 'Дахин захиална.' }).expect(201)).body as Review;
    expect(r2.id).toBe(r1.id);
    expect(r2).toMatchObject({ rating: 5, comment: 'Дахин захиална.', reply: null });
    expect(events.filter((e) => e.type === 'review.created')).toHaveLength(1);
    await http().post('/api/reviews').set(auth.other).send({ provider_id: ids.provider, rating: 3 }).expect(201);

    expect(body(await http().put(`/api/reviews/${String(r1.id)}/reply`).set(auth.customer).send({ reply: 'x' }).expect(403)).code).toBe('REVIEW_NOT_YOURS');
    const replied = (await http().put(`/api/reviews/${String(r1.id)}/reply`).set(auth.provider).send({ reply: 'Баярлалаа!' }).expect(200)).body as Review;
    expect(replied.reply).toBe('Баярлалаа!');
    await http().put('/api/reviews/999999999/reply').set(auth.provider).send({ reply: 'x' }).expect(404);

    const list = (await http().get(`/api/reviews/provider/${ids.provider}?sort=low`).set(auth.customer).expect(200)).body as ProviderReviews;
    expect(list).toMatchObject({ count: 2, average: 4, total: 2, can_review: true });
    expect(list.stats).toEqual({ '1': 0, '2': 0, '3': 1, '4': 0, '5': 1 });
    expect(list.items.map((r) => r.rating)).toEqual([3, 5]);
    expect(list.own?.id).toBe(r1.id);
    const anon = (await http().get(`/api/reviews/provider/${ids.provider}`).expect(200)).body as ProviderReviews;
    expect(anon).toMatchObject({ own: null, can_review: false });

    const past2 = (await http().get('/api/bookings/mine?tab=past').set(auth.customer).expect(200)).body as BookingList<MyBookingsTab>;
    expect(past2.items.find((b) => b.status === 'ACCEPTED')?.can_review).toBe(false);

    const browse = (await http().get(`/api/posts?q=${encodeURIComponent('Komatsu PC200')}`).expect(200)).body as { items: Listing[] };
    const card = browse.items.find((i) => i.id === rental);
    expect(card?.user).toMatchObject({ rating_average: 4, rating_count: 2 });
  });

  it('the seller page: trust, finished jobs, live listings, newest reviews', async () => {
    const page = (await http().get(`/api/sellers/${ids.provider}`).expect(200)).body as SellerProfile;
    expect(page.user).toMatchObject({ id: ids.provider, rating_average: 4, rating_count: 2, reply_minutes: 120, phone_number: null });
    expect(page.jobs).toBeGreaterThanOrEqual(1);
    expect(page.listings.map((l) => l.id).sort()).toEqual([rental, rental2, shop].sort());
    expect(page.reviews[0].reply ?? page.reviews[1].reply).toBe('Баярлалаа!');
    await http().get('/api/sellers/00000000-0000-0000-0000-000000000000').expect(404);
  });
});
