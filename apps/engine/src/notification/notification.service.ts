import { BadRequestException, type BeforeApplicationShutdown, Inject, Injectable, Logger, type OnModuleInit, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  NOTIFICATION_TOPICS, NOTIFICATIONS_PAGE, SOCKET_EVENTS, isLocale, notificationCopy, notificationTarget, notificationTopic,
  notificationWebPath, type AppNotification, type Locale, type NotificationData, type NotificationKind,
  type NotificationSettings, type NotificationSettingsUpdate, type NotificationTopic, type PushDeviceRequest,
} from '@zuuchmap/core';
import { translator } from '@zuuchmap/core/i18n';
import { AUTH_CONFIG, type AuthConfig } from '../auth/auth.config';
import type { RequestUser } from '../auth/request-user';
import { env } from '../config/env';
import { REALTIME, type RealtimePort } from '../events/realtime';
import { LISTING_EVENTS, type InMemoryListingEvents, type ListingEvent, type ListingEventPort } from '../post/listing-events';
import { SavedSearchService, type MatchableListing } from '../post/saved-search.service';
import { RedisService } from '../redis/redis.service';
import { NOTIFY_TRANSPORTS, type NotifyTransports, type OutboundPush } from './transports';

/** One notification for one account, before it is stored and sent. */
interface Planned {
  user_id: string;
  kind: NotificationKind;
  data: NotificationData;
  /** Folds repeats into one unread row (a saved search's matches); a fold sends nothing. */
  group_key?: string;
  /** False for Чат messages: pushed, never listed (Чат keeps its own unread). */
  store: boolean;
}

interface NotificationRow { id: string; user_id: string; kind: NotificationKind; data: NotificationData; read_at: Date | null; created_at: Date }
interface DeviceRow { provider: 'EXPO' | 'WEB'; token: string; keys: { p256dh: string; auth: string } | null; locale: string }
interface UserRow { email: string | null; locale: string | null; notify_topics: Partial<Record<NotificationTopic, boolean>> }
interface BookingNames {
  id: number; post_id: number | null; customer_id: string; provider_id: string; post_title: string | null;
  start_date: string; end_date: string; start_time: string | null; customer_name: string | null; provider_name: string | null;
}

const MAX_DEVICES = 10;
const CHAT_MAIL_EVERY_MS = 60 * 60 * 1000;
const SHUTDOWN_DRAIN_MS = 8_000;
/** A claim older than this belongs to a worker that died mid-send; the sweep takes it over. */
const OUTBOX_CLAIM_SECONDS = 300;
/** After this many failed sends a row stays for inspection (`last_error`) until the nightly prune. */
const OUTBOX_MAX_ATTEMPTS = 5;

/** The company when there is one, else "parent given" ("Ц. Ганзориг"). */
const NAME_SQL = (u: string, c: string): string =>
  `COALESCE(${c}.name, NULLIF(concat_ws(' ', ${u}.parent_name, ${u}.given_name), ''))`;

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const toView = (r: NotificationRow): AppNotification => ({
  id: r.id,
  kind: r.kind,
  data: r.data,
  read_at: r.read_at?.toISOString() ?? null,
  created_at: r.created_at.toISOString(),
});

/**
 * Phase 7: every `LISTING_EVENTS` event becomes notifications. Each is stored for the centre
 * (Figma I3), sent over the socket, then pushed to every device of the account in that device's
 * language, or e-mailed when the account has no device. The Figma I6 switches silence a topic's
 * push and e-mail, never the centre.
 */
@Injectable()
export class NotificationService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly log = new Logger(NotificationService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
    @Inject(NOTIFY_TRANSPORTS) private readonly transports: NotifyTransports,
    @Inject(AUTH_CONFIG) private readonly auth: AuthConfig,
    private readonly savedSearches: SavedSearchService,
    private readonly redis: RedisService,
    @Optional() @Inject(REALTIME) private readonly realtime?: RealtimePort,
  ) {}

  onModuleInit(): void {
    (this.events as Partial<InMemoryListingEvents>).subscribe?.((e) => {
      this.track(this.enqueue(e), e.type);
    });
  }

  /** Shutdown waits for in-flight sends (pm2 allows 10 s); what is left the next sweep resumes. */
  async beforeApplicationShutdown(): Promise<void> {
    await Promise.race([this.drain(), new Promise((r) => setTimeout(r, SHUTDOWN_DRAIN_MS).unref())]);
  }

  /** Resolves once every event seen so far is stored and sent (tests, shutdown). */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  private track(job: Promise<void>, what: string): void {
    const safe = job.catch((err: unknown) => {
      this.log.error(`${what}: ${err instanceof Error ? err.message : String(err)}`);
    });
    this.pending.add(safe);
    void safe.finally(() => this.pending.delete(safe));
  }

  /** The event is on disk before anything is sent, so a restart cannot lose it. */
  private async enqueue(e: ListingEvent): Promise<void> {
    const [row] = await this.ds.query<Array<{ id: string }>>('INSERT INTO notification_outbox (event) VALUES ($1) RETURNING id', [e]);
    await this.process(row.id);
  }

  /** Minute sweep: rows a restart or an error left unsent, whose claim has lapsed. */
  async sweep(): Promise<number> {
    const rows = await this.ds.query<Array<{ id: string }>>(
      `SELECT id FROM notification_outbox
        WHERE attempts < $1 AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => $2))
        ORDER BY id LIMIT 100`,
      [OUTBOX_MAX_ATTEMPTS, OUTBOX_CLAIM_SECONDS],
    );
    for (const r of rows) this.track(this.process(r.id), `outbox ${r.id}`);
    await this.drain();
    return rows.length;
  }

  /** Claims the row (one sender across workers), sends what is still unsent, deletes it. */
  private async process(id: string): Promise<void> {
    // An UPDATE answers [rows, count].
    const [rows] = await this.ds.query<[Array<{ event: ListingEvent; sent: number }>, number]>(
      `UPDATE notification_outbox SET claimed_at = now(), attempts = attempts + 1
        WHERE id = $1 AND attempts < $2 AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => $3))
        RETURNING event, sent`,
      [id, OUTBOX_MAX_ATTEMPTS, OUTBOX_CLAIM_SECONDS],
    );
    const claimed = rows.at(0);
    if (!claimed) return;
    try {
      const plan = await this.plan(claimed.event);
      for (let i = claimed.sent; i < plan.length; i++) {
        await this.deliver(plan[i]);
        if (i < plan.length - 1) await this.ds.query('UPDATE notification_outbox SET sent = $2 WHERE id = $1', [id, i + 1]);
      }
      await this.ds.query('DELETE FROM notification_outbox WHERE id = $1', [id]);
    } catch (err) {
      await this.ds.query('UPDATE notification_outbox SET claimed_at = NULL, last_error = $2 WHERE id = $1', [id, err instanceof Error ? err.message : String(err)]);
      throw err;
    }
  }

  // ---- events → notifications -------------------------------------------------

  private async plan(e: ListingEvent): Promise<Planned[]> {
    switch (e.type) {
      case 'listing.submitted': {
        const admins = await this.adminIds();
        return admins
          .filter((id) => id !== e.user_id)
          .map((id) => ({ user_id: id, kind: 'LISTING_SUBMITTED', data: { post_id: e.post_id, title: e.title }, store: true }));
      }
      case 'listing.approved': {
        const out: Planned[] = [];
        if (e.user_id) out.push({ user_id: e.user_id, kind: 'LISTING_APPROVED', data: { post_id: e.post_id, title: e.title, revision: e.revision }, store: true });
        if (!e.revision) out.push(...(await this.savedSearchAlerts(e.post_id)));
        return out;
      }
      case 'listing.rejected':
        return e.user_id
          ? [{ user_id: e.user_id, kind: 'LISTING_REJECTED', data: { post_id: e.post_id, title: e.title, revision: e.revision, reason: e.reason, field_key: e.field_key }, store: true }]
          : [];
      case 'listing.expiring':
        return e.user_id ? [{ user_id: e.user_id, kind: 'LISTING_EXPIRING', data: { post_id: e.post_id, title: e.title, days_left: e.days_left }, store: true }] : [];
      case 'listing.expired':
        return e.user_id ? [{ user_id: e.user_id, kind: 'LISTING_EXPIRED', data: { post_id: e.post_id, title: e.title }, store: true }] : [];
      case 'listing.renewed':
        return [];
      case 'booking.requested':
      case 'booking.accepted':
      case 'booking.declined':
      case 'booking.cancelled':
      case 'booking.expired':
      case 'booking.reminder': {
        const b = await this.booking(e.booking_id);
        if (!b) return [];
        const kind = `BOOKING_${e.type.slice('booking.'.length).toUpperCase()}` as NotificationKind;
        const asCustomer = e.user_id === b.customer_id;
        return [{
          user_id: e.user_id,
          kind,
          data: {
            booking_id: b.id, post_id: b.post_id, title: b.post_title, name: asCustomer ? b.provider_name : b.customer_name,
            start_date: b.start_date, end_date: b.end_date, start_time: b.start_time, role: asCustomer ? 'CUSTOMER' : 'PROVIDER',
          },
          store: true,
        }];
      }
      case 'booking.review_prompt': {
        const b = await this.booking(e.booking_id);
        return [{
          user_id: e.user_id, kind: 'REVIEW_PROMPT',
          data: { booking_id: e.booking_id, post_id: b?.post_id ?? null, title: e.title, name: b?.provider_name ?? null, provider_id: e.provider_id },
          store: true,
        }];
      }
      case 'review.created': {
        const r = (await this.ds.query<Array<{ name: string | null }>>(
          `SELECT ${NAME_SQL('u', 'c')} AS name FROM reviews r JOIN users u ON u.id = r.author_id LEFT JOIN companies c ON c.owner_id = u.id WHERE r.id = $1`,
          [e.review_id],
        )).at(0);
        return [{ user_id: e.user_id, kind: 'REVIEW_CREATED', data: { review_id: e.review_id, rating: e.rating, name: r?.name ?? null, provider_id: e.user_id }, store: true }];
      }
      case 'review.replied': {
        const name = await this.nameOf(e.provider_id);
        return [{ user_id: e.user_id, kind: 'REVIEW_REPLIED', data: { review_id: e.review_id, name, provider_id: e.provider_id }, store: true }];
      }
      case 'message.created': {
        // A booking step arrives as a message with no preview; its booking notification covers it.
        if (!e.preview) return [];
        const m = (await this.ds.query<Array<{ sender_id: string | null }>>('SELECT sender_id FROM messages WHERE id = $1', [e.message_id])).at(0);
        const name = m?.sender_id ? await this.nameOf(m.sender_id) : null;
        return [{ user_id: e.user_id, kind: 'MESSAGE_CREATED', data: { conversation_id: e.conversation_id, name, preview: e.preview }, store: false }];
      }
    }
  }

  private async savedSearchAlerts(postId: number): Promise<Planned[]> {
    const post = (await this.ds.query<MatchableListing[]>('SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL', [postId])).at(0);
    if (!post) return [];
    const hits = await this.savedSearches.matching(post);
    return hits.map((s) => ({
      user_id: s.user_id, kind: 'SAVED_SEARCH_MATCH', group_key: `ss:${s.id}`, store: true,
      data: { saved_search_id: s.id, query: s.name, count: 1, post_id: postId, title: post.title ?? null },
    }));
  }

  private async adminIds(): Promise<string[]> {
    if (!this.auth.adminPhones.length) return [];
    const rows = await this.ds.query<Array<{ id: string }>>('SELECT id FROM users WHERE phone_number = ANY($1::varchar[])', [[...this.auth.adminPhones]]);
    return rows.map((r) => r.id);
  }

  private async nameOf(userId: string): Promise<string | null> {
    const r = (await this.ds.query<Array<{ name: string | null }>>(
      `SELECT ${NAME_SQL('u', 'c')} AS name FROM users u LEFT JOIN companies c ON c.owner_id = u.id WHERE u.id = $1`,
      [userId],
    )).at(0);
    return r?.name ?? null;
  }

  private async booking(id: number): Promise<BookingNames | null> {
    const b = (await this.ds.query<BookingNames[]>(
      `SELECT b.id, b.post_id, b.customer_id, b.provider_id, b.post_title, b.start_time,
              to_char(b.start_date, 'YYYY-MM-DD') AS start_date, to_char(b.end_date, 'YYYY-MM-DD') AS end_date,
              ${NAME_SQL('cu', 'cc')} AS customer_name, ${NAME_SQL('pu', 'pc')} AS provider_name
         FROM bookings b
         JOIN users cu ON cu.id = b.customer_id LEFT JOIN companies cc ON cc.owner_id = cu.id
         JOIN users pu ON pu.id = b.provider_id LEFT JOIN companies pc ON pc.owner_id = pu.id
        WHERE b.id = $1`,
      [id],
    )).at(0);
    return b ?? null;
  }

  // ---- store, socket, push, e-mail ---------------------------------------------

  private async deliver(p: Planned): Promise<void> {
    let row: NotificationRow | null = null;
    if (p.store) {
      const res = p.group_key
        ? await this.ds.query<Array<NotificationRow & { inserted: boolean }>>(
          `INSERT INTO notifications (user_id, kind, data, group_key) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, group_key) WHERE read_at IS NULL AND group_key IS NOT NULL
           DO UPDATE SET created_at = now(), data = notifications.data || jsonb_build_object(
             'count', COALESCE((notifications.data->>'count')::int, 1) + 1, 'post_id', EXCLUDED.data->'post_id', 'title', EXCLUDED.data->'title')
           RETURNING *, (xmax = 0) AS inserted`,
          [p.user_id, p.kind, p.data, p.group_key],
        )
        : await this.ds.query<Array<NotificationRow & { inserted: boolean }>>(
          'INSERT INTO notifications (user_id, kind, data) VALUES ($1, $2, $3) RETURNING *, true AS inserted',
          [p.user_id, p.kind, p.data],
        );
      row = res[0];
      this.realtime?.toUser(p.user_id, SOCKET_EVENTS.NOTIFICATION_CREATED, toView(row));
      if (p.group_key?.startsWith('ss:')) await this.ds.query('UPDATE saved_searches SET last_notified_at = now() WHERE id = $1', [p.data.saved_search_id]);
      if (!res[0].inserted) return;
    }

    const user = (await this.ds.query<UserRow[]>('SELECT email, locale, notify_topics FROM users WHERE id = $1', [p.user_id])).at(0);
    if (!user) return;
    const topic = notificationTopic(p.kind);
    if (topic && user.notify_topics[topic] === false) return;

    const target = notificationTarget(p);
    const url = notificationWebPath(target);
    const devices = await this.ds.query<DeviceRow[]>('SELECT provider, token, keys, locale FROM push_devices WHERE user_id = $1', [p.user_id]);
    if (devices.length) {
      const messages: OutboundPush[] = devices.map((d) => {
        const copy = notificationCopy(p, translator(isLocale(d.locale) ? d.locale : 'mn'));
        return {
          provider: d.provider, token: d.token, keys: d.keys, title: copy.title, body: copy.body,
          data: { notification_id: row ? row.id : null, kind: p.kind, data: p.data, url },
        };
      });
      const { dead } = await this.transports.push(messages);
      if (dead.length) await this.ds.query('DELETE FROM push_devices WHERE token = ANY($1::text[])', [dead]);
      return;
    }

    if (!user.email || !this.transports.mailEnabled) return;
    // A conversation e-mails at most once an hour; the rest wait in Чат.
    if (p.kind === 'MESSAGE_CREATED' && !(await this.redis.claimCron(`mail:chat:${p.user_id}:${String(p.data.conversation_id)}`, CHAT_MAIL_EVERY_MS))) return;
    const locale: Locale = isLocale(user.locale) ? user.locale : 'mn';
    const t = translator(locale);
    const copy = notificationCopy(p, t);
    const link = `${env().PUBLIC_WEB_URL.replace(/\/$/, '')}${url}`;
    await this.transports.mail({
      to: user.email,
      subject: copy.title,
      text: `${copy.body}\n\n${t('notif.emailOpen')}: ${link}\n\n${t('notif.emailFooter')}`,
      html: mailHtml(copy.title, copy.body, t('notif.emailOpen'), link, t('notif.emailFooter'), locale),
    });
  }

  // ---- centre ------------------------------------------------------------------

  async list(me: RequestUser, before?: string, beforeId?: string): Promise<AppNotification[]> {
    const rows = await this.ds.query<NotificationRow[]>(
      `SELECT * FROM notifications
        WHERE user_id = $1 AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, COALESCE($3::bigint, 9223372036854775807)))
        ORDER BY created_at DESC, id DESC LIMIT $4`,
      [me.id, before ?? null, beforeId ?? null, NOTIFICATIONS_PAGE],
    );
    return rows.map(toView);
  }

  async unreadCount(me: RequestUser): Promise<number> {
    const [r] = await this.ds.query<Array<{ n: number }>>('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [me.id]);
    return r.n;
  }

  /** The given ids, or every unread row when none are given. */
  async markRead(me: RequestUser, ids?: string[]): Promise<{ ok: true }> {
    if (ids && !ids.length) return { ok: true };
    await this.ds.query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND ($2::bigint[] IS NULL OR id = ANY($2::bigint[]))',
      [me.id, ids ?? null],
    );
    return { ok: true };
  }

  // ---- settings and devices ----------------------------------------------------

  async settings(me: RequestUser): Promise<NotificationSettings> {
    const u = (await this.ds.query<UserRow[]>('SELECT email, locale, notify_topics FROM users WHERE id = $1', [me.id])).at(0);
    const locale = u?.locale;
    const topics = Object.fromEntries(NOTIFICATION_TOPICS.map((k) => [k, u?.notify_topics[k] !== false])) as Record<NotificationTopic, boolean>;
    return { topics, locale: isLocale(locale) ? locale : null, email: u?.email ?? null };
  }

  async updateSettings(me: RequestUser, body: NotificationSettingsUpdate): Promise<NotificationSettings> {
    const topics: Partial<Record<NotificationTopic, boolean>> = {};
    for (const k of NOTIFICATION_TOPICS) if (typeof body.topics?.[k] === 'boolean') topics[k] = body.topics[k];
    await this.ds.query(
      'UPDATE users SET notify_topics = notify_topics || $2::jsonb, locale = COALESCE($3, locale) WHERE id = $1',
      [me.id, JSON.stringify(topics), body.locale ?? null],
    );
    return this.settings(me);
  }

  /** A token moves to whoever registers it last (one phone, two accounts in turn). */
  async registerDevice(me: RequestUser, d: PushDeviceRequest): Promise<{ ok: true }> {
    if (d.provider === 'WEB' && !d.keys) throw new BadRequestException({ message: 'A browser subscription needs its keys', code: 'VALIDATION_FAILED' });
    await this.ds.transaction(async (em) => {
      await em.query(
        `INSERT INTO push_devices (user_id, provider, token, keys, locale, platform) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, provider = EXCLUDED.provider, keys = EXCLUDED.keys,
           locale = EXCLUDED.locale, platform = EXCLUDED.platform, last_seen_at = now()`,
        [me.id, d.provider, d.token, d.provider === 'WEB' ? d.keys : null, d.locale ?? 'mn', d.platform ?? null],
      );
      await em.query(
        `DELETE FROM push_devices WHERE user_id = $1 AND id NOT IN (
           SELECT id FROM push_devices WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT ${MAX_DEVICES})`,
        [me.id],
      );
      // The device's language is the account's best guess for e-mail until it says otherwise.
      if (d.locale) await em.query('UPDATE users SET locale = COALESCE(locale, $2) WHERE id = $1', [me.id, d.locale]);
    });
    return { ok: true };
  }

  async removeDevice(me: RequestUser, token: string): Promise<{ ok: true }> {
    await this.ds.query('DELETE FROM push_devices WHERE user_id = $1 AND token = $2', [me.id, token]);
    return { ok: true };
  }

  vapidKey(): string | null {
    return this.transports.webPushKey;
  }

  /** Nightly: the centre keeps NOTIFICATION_RETENTION_DAYS, and so do outbox rows that gave up. */
  async prune(): Promise<number> {
    const days = env().NOTIFICATION_RETENTION_DAYS;
    const res = await this.ds.query<[unknown, number]>('DELETE FROM notifications WHERE created_at < now() - make_interval(days => $1)', [days]);
    await this.ds.query('DELETE FROM notification_outbox WHERE created_at < now() - make_interval(days => $1)', [days]);
    return res[1];
  }
}

/** Figma Q1–Q4 in miniature: wordmark, title, the sentence, one orange button, the footer. */
function mailHtml(title: string, body: string, cta: string, link: string, footer: string, locale: Locale): string {
  return `<!doctype html><html lang="${locale}"><body style="margin:0;background:#F3F5F8;font-family:Geologica,Arial,sans-serif;color:#0E1726">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:12px;padding:32px">
<tr><td style="font-weight:800;font-size:18px;padding-bottom:24px">Zuuch<span style="color:#FF6A1F">Map</span></td></tr>
<tr><td style="font-weight:700;font-size:20px;line-height:1.3;padding-bottom:12px">${esc(title)}</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:24px">${esc(body)}</td></tr>
<tr><td><a href="${esc(link)}" style="display:inline-block;background:#FF6A1F;color:#1A0800;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:10px">${esc(cta)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#4A5A76;padding-top:32px">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
