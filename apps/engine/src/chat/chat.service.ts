import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager } from 'typeorm';
import {
  CONVERSATIONS_PAGE, MESSAGES_PAGE, SOCKET_EVENTS,
  type Conversation, type ConversationOpenResponse, type ConversationReadPayload, type DealRole, type ListingListItem,
  type Message, type MessageCreatedPayload, type MessageKind, type PublicUser,
} from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { REALTIME, type RealtimePort } from '../events/realtime';
import { PeopleService } from '../people/people.service';
import { Post } from '../post/entities/post.entity';
import { ContactService } from '../post/contact.service';
import { LISTING_EVENTS, type ListingEventPort } from '../post/listing-events';
import { PostService } from '../post/post.service';

const PREVIEW_LENGTH = 140;

interface ConversationRow {
  id: string;
  post_id: number | null;
  post_title: string | null;
  customer_id: string;
  provider_id: string;
  last_message_at: Date | null;
  last_message_preview: string | null;
  last_message_kind: MessageKind | null;
  last_sender_id: string | null;
  customer_unread: number;
  provider_unread: number;
  first_customer_at: Date | null;
  first_reply_at: Date | null;
  date_created: Date;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string;
  booking_id: number | null;
  read_at: Date | null;
  date_created: Date;
}

const toMessage = (m: MessageRow): Message => ({
  id: m.id,
  conversation_id: m.conversation_id,
  sender_id: m.sender_id,
  kind: m.kind,
  body: m.body,
  booking_id: m.booking_id,
  read_at: m.read_at?.toISOString() ?? null,
  date_created: m.date_created.toISOString(),
});

const notFound = (): never => {
  throw new NotFoundException({ message: 'Chat not found', code: 'CONVERSATION_NOT_FOUND' });
};

/**
 * Чат: one thread per listing and customer. The customer opens it from the listing; the provider
 * is the listing's owner. Only typed text from the provider after the customer's first message
 * counts as a reply (reply time, review eligibility); booking steps are messages too, so the
 * thread reads as the deal's history.
 */
@Injectable()
export class ChatService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly posts: PostService,
    private readonly people: PeopleService,
    private readonly contacts: ContactService,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
    @Optional() @Inject(REALTIME) private readonly realtime?: RealtimePort,
  ) {}

  // ---- mapping -------------------------------------------------------------

  private roleOf(c: ConversationRow, meId: string): DealRole {
    return c.customer_id === meId ? 'CUSTOMER' : 'PROVIDER';
  }

  private async views(rows: ConversationRow[], meId: string): Promise<Conversation[]> {
    if (rows.length === 0) return [];
    const others = rows.map((c) => (c.customer_id === meId ? c.provider_id : c.customer_id));
    const users = await this.people.publicUsers(others, 'full');
    const postIds = [...new Set(rows.map((c) => c.post_id).filter((x): x is number => x !== null))];
    const posts = postIds.length ? (await this.ds.getRepository(Post).findBy({ id: In(postIds) })).filter((p) => !p.deleted_at) : [];
    const items = new Map<number, ListingListItem>((await this.posts.items(posts, 'none')).map((it) => [it.id, it]));
    return rows.map((c, i) => {
      const role = this.roleOf(c, meId);
      const found = users.get(others[i]);
      const other: PublicUser = found ? { ...found } : ({ id: others[i], type: null, phone_number: null, parent_name: null, given_name: null, email: null, profile_picture: null, is_verified: null, date_created: c.date_created.toISOString() } satisfies PublicUser);
      // Reply time describes providers; a customer's is meaningless.
      if (role === 'PROVIDER') delete other.reply_minutes;
      return {
        id: c.id,
        post_id: c.post_id,
        post: c.post_id !== null ? (items.get(c.post_id) ?? null) : null,
        post_title: c.post_title,
        role,
        other,
        last_message_at: c.last_message_at?.toISOString() ?? null,
        last_message_preview: c.last_message_preview,
        last_message_kind: c.last_message_kind,
        last_message_mine: c.last_sender_id === meId,
        unread: role === 'CUSTOMER' ? c.customer_unread : c.provider_unread,
        date_created: c.date_created.toISOString(),
      };
    });
  }

  /** A thread the caller is in; anyone else gets 403 NOT_A_PARTICIPANT, a missing id 404. */
  private async load(meId: string, id: string, em?: EntityManager, lock = false): Promise<ConversationRow> {
    const rows = await (em ?? this.ds.manager).query<ConversationRow[]>(
      `SELECT * FROM conversations WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    const c = rows.at(0) ?? notFound();
    if (c.customer_id !== meId && c.provider_id !== meId) {
      throw new ForbiddenException({ message: 'Not a participant', code: 'NOT_A_PARTICIPANT' });
    }
    return c;
  }

  // ---- threads -------------------------------------------------------------

  /**
   * The thread between `customerId` and a listing's owner, created if missing. Callers check the
   * listing is one that may be contacted; this only refuses self-contact and an ownerless listing.
   */
  async ensure(em: EntityManager, post: Pick<Post, 'id' | 'user_id' | 'title'>, customerId: string): Promise<ConversationRow> {
    if (!post.user_id) throw new BadRequestException({ message: 'Listing has no owner', code: 'POST_HAS_NO_OWNER' });
    if (post.user_id === customerId) throw new BadRequestException({ message: 'Cannot message yourself', code: 'CANNOT_MESSAGE_SELF' });
    await em.query(
      `INSERT INTO conversations (post_id, post_title, customer_id, provider_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (post_id, customer_id) WHERE post_id IS NOT NULL DO NOTHING`,
      [post.id, post.title, customerId, post.user_id],
    );
    const rows = await em.query<ConversationRow[]>('SELECT * FROM conversations WHERE post_id = $1 AND customer_id = $2', [post.id, customerId]);
    return rows[0];
  }

  /** `POST /conversations`: open (or return) the thread about a live listing, optionally with a first message. */
  async open(me: RequestUser, postId: number, body?: string): Promise<ConversationOpenResponse> {
    const post = await this.posts.loadPost(postId);
    const existing = await this.ds.query<Array<{ id: string }>>('SELECT id FROM conversations WHERE post_id = $1 AND customer_id = $2', [postId, me.id]);
    // An existing thread survives the listing lapsing; a new one needs a live listing.
    if (!existing.length && !this.posts.isLive(post)) {
      throw new NotFoundException({ message: 'Listing is no longer available', code: 'POST_NOT_AVAILABLE' });
    }
    const conv = await this.ds.transaction(async (em) => {
      const c = await this.ensure(em, post, me.id);
      // A thread opened is a contact of the listing's (once a day per customer).
      if (!existing.length) await this.contacts.record(post.id, 'CHAT', me.id, null, em);
      return c;
    });
    const message = body !== undefined && body.trim() ? await this.send(me, conv.id, body) : null;
    return { conversation: await this.get(me, conv.id), message };
  }

  async get(me: RequestUser, id: string): Promise<Conversation> {
    const [view] = await this.views([await this.load(me.id, id)], me.id);
    return view;
  }

  /** Inbox: threads with at least one message, newest first, CONVERSATIONS_PAGE per page before `before`. */
  async list(me: RequestUser, before?: string): Promise<Conversation[]> {
    const rows = await this.ds.query<ConversationRow[]>(
      `SELECT * FROM conversations
        WHERE (customer_id = $1 OR provider_id = $1) AND last_message_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR last_message_at < $2::timestamptz)
        ORDER BY last_message_at DESC, id DESC LIMIT $3`,
      [me.id, before ?? null, CONVERSATIONS_PAGE],
    );
    return this.views(rows, me.id);
  }

  async unreadCount(me: RequestUser): Promise<number> {
    const rows = await this.ds.query<Array<{ n: number }>>(
      `SELECT COALESCE(SUM(CASE WHEN customer_id = $1 THEN customer_unread ELSE provider_unread END), 0)::int AS n
         FROM conversations WHERE customer_id = $1 OR provider_id = $1`,
      [me.id],
    );
    return rows[0]?.n ?? 0;
  }

  // ---- messages ------------------------------------------------------------

  /** Newest first, MESSAGES_PAGE at a time, strictly older than (`before`, `before_id`). */
  async messages(me: RequestUser, id: string, before?: string, beforeId?: string): Promise<Message[]> {
    await this.load(me.id, id);
    const rows = await this.ds.query<MessageRow[]>(
      `SELECT * FROM messages
        WHERE conversation_id = $1
          AND ($2::timestamptz IS NULL OR (date_created, id) < ($2::timestamptz, COALESCE($3::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
        ORDER BY date_created DESC, id DESC LIMIT $4`,
      [id, before ?? null, beforeId ?? null, MESSAGES_PAGE],
    );
    return rows.map(toMessage);
  }

  /** `POST /conversations/:id/messages`: typed text. */
  async send(me: RequestUser, id: string, body: string): Promise<Message> {
    const text = body.trim();
    if (!text) throw new BadRequestException({ message: 'Write a message first', code: 'EMPTY_MESSAGE' });
    const { message, recipient } = await this.ds.transaction(async (em) => {
      const c = await this.load(me.id, id, em, true);
      return this.append(em, c, me.id, 'TEXT', text, null);
    });
    this.deliver(recipient, message, text);
    return message;
  }

  /**
   * A booking step in the thread between a booking's two people. Runs inside the booking's own
   * transaction; the caller delivers the returned message once it commits.
   */
  async bookingStep(
    em: EntityManager,
    post: Pick<Post, 'id' | 'user_id' | 'title'>,
    customerId: string,
    senderId: string,
    kind: Exclude<MessageKind, 'TEXT'>,
    bookingId: number,
  ): Promise<{ message: Message; recipient: string; conversation_id: string }> {
    const conv = await this.ensure(em, post, customerId);
    const locked = (await em.query<ConversationRow[]>('SELECT * FROM conversations WHERE id = $1 FOR UPDATE', [conv.id]))[0];
    return { ...(await this.append(em, locked, senderId, kind, '', bookingId)), conversation_id: conv.id };
  }

  /** The conversation id between a customer and a listing, if any (bookings link to it). */
  async idFor(postIds: Array<number | null>, customerIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const pairs = postIds.map((p, i) => [p, customerIds[i]] as const).filter((x): x is readonly [number, string] => x[0] !== null);
    if (!pairs.length) return out;
    const rows = await this.ds.query<Array<{ id: string; post_id: number; customer_id: string }>>(
      `SELECT c.id, c.post_id, c.customer_id FROM conversations c
         JOIN unnest($1::int[], $2::uuid[]) AS k(post_id, customer_id) ON k.post_id = c.post_id AND k.customer_id = c.customer_id`,
      [pairs.map((p) => p[0]), pairs.map((p) => p[1])],
    );
    for (const r of rows) out.set(`${String(r.post_id)}:${r.customer_id}`, r.id);
    return out;
  }

  private async append(
    em: EntityManager,
    c: ConversationRow,
    senderId: string,
    kind: MessageKind,
    body: string,
    bookingId: number | null,
  ): Promise<{ message: Message; recipient: string }> {
    const fromCustomer = senderId === c.customer_id;
    const rows = await em.query<MessageRow[]>(
      'INSERT INTO messages (conversation_id, sender_id, kind, body, booking_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [c.id, senderId, kind, body, bookingId],
    );
    const m = rows[0];
    await em.query(
      `UPDATE conversations SET
          last_message_at = $2, last_message_preview = $3, last_message_kind = $4, last_sender_id = $5,
          customer_unread = CASE WHEN $6 THEN 0 ELSE customer_unread + 1 END,
          provider_unread = CASE WHEN $6 THEN provider_unread + 1 ELSE 0 END,
          first_customer_at = CASE WHEN $6 AND $7 THEN COALESCE(first_customer_at, $2) ELSE first_customer_at END,
          first_reply_at = CASE WHEN NOT $6 AND $7 AND first_customer_at IS NOT NULL THEN COALESCE(first_reply_at, $2) ELSE first_reply_at END
        WHERE id = $1`,
      [c.id, m.date_created, body.slice(0, PREVIEW_LENGTH) || null, kind, senderId, fromCustomer, kind === 'TEXT'],
    );
    // Writing in a thread reads it: the sender's unread is zeroed above, and what the other side sent is read now.
    await em.query(
      'UPDATE messages SET read_at = $3 WHERE conversation_id = $1 AND sender_id IS DISTINCT FROM $2 AND read_at IS NULL',
      [c.id, senderId, m.date_created],
    );
    return { message: toMessage(m), recipient: fromCustomer ? c.provider_id : c.customer_id };
  }

  /** After commit: the socket event to the recipient and the notification event. */
  deliver(recipient: string, message: Message, preview: string): void {
    this.realtime?.toUser(recipient, SOCKET_EVENTS.MESSAGE_CREATED, { conversation_id: message.conversation_id, message } satisfies MessageCreatedPayload);
    // The sender has read everything before their own message.
    this.realtime?.toUser(recipient, SOCKET_EVENTS.CONVERSATION_READ, { conversation_id: message.conversation_id, read_at: message.date_created } satisfies ConversationReadPayload);
    this.events.emit({ type: 'message.created', conversation_id: message.conversation_id, message_id: message.id, user_id: recipient, preview: preview.slice(0, PREVIEW_LENGTH) });
  }

  /** `PUT /conversations/:id/read`: everything the other side sent is read. */
  async read(me: RequestUser, id: string): Promise<{ ok: true }> {
    const c = await this.load(me.id, id);
    const now = new Date();
    const mine = this.roleOf(c, me.id) === 'CUSTOMER' ? 'customer_unread' : 'provider_unread';
    await this.ds.transaction(async (em) => {
      await em.query(`UPDATE conversations SET ${mine} = 0 WHERE id = $1`, [id]);
      await em.query('UPDATE messages SET read_at = $3 WHERE conversation_id = $1 AND sender_id IS DISTINCT FROM $2 AND read_at IS NULL', [id, me.id, now]);
    });
    const other = c.customer_id === me.id ? c.provider_id : c.customer_id;
    this.realtime?.toUser(other, SOCKET_EVENTS.CONVERSATION_READ, { conversation_id: id, read_at: now.toISOString() } satisfies ConversationReadPayload);
    return { ok: true };
  }
}
