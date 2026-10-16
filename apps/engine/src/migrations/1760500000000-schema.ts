import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The whole schema, one block per table in foreign-key order.
 *
 * Until launch this file is edited in place: nothing outside the dev and test databases has run
 * it. After a change run `npm run db:reset -w @zuuchmap/engine` (the test database rebuilds itself
 * when this file's hash changes). From launch on it is frozen and changes are new, append-only
 * migrations beside it.
 */

/** `"key":` and the JSON literal after it, dropped so keys never match a search. */
const ATTRS_VALUES = `regexp_replace(coalesce("attributes"::text, ''), '"(?:[^"\\\\]|\\\\.)*"\\s*:\\s*(?:true|false|null)?', ' ', 'g')`;
const part = (text: string, weight: string): string =>
  `setweight(to_tsvector('simple', regexp_replace(${text}, '[^[:alnum:]]+', ' ', 'g')), '${weight}')`;
/**
 * `posts.search_vector`: title (A) over attribute *values* (B) over details/location/address (C),
 * every part collapsed on punctuation so "PC200-8" is stored as the tokens people type.
 * `post/search-terms.ts` `postDocument` mirrors it for the saved-search matcher — change the two together.
 */
const SEARCH_VECTOR = [
  part(`coalesce("title", '')`, 'A'),
  part(ATTRS_VALUES, 'B'),
  part(`coalesce("details", '') || ' ' || coalesce("location", '') || ' ' || coalesce("address", '')`, 'C'),
].join(' || ');

export class Schema1760500000000 implements MigrationInterface {
  name = 'Schema1760500000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await q.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await q.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await q.query('CREATE EXTENSION IF NOT EXISTS btree_gist');

    // ── Accounts ────────────────────────────────────────────────────────────────────────────
    // `locale`: e-mail language. `notify_topics`: the Figma I6 switches; a missing key is on.
    await q.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(16) NOT NULL DEFAULT 'CUSTOMER' CHECK ("type" IN ('CUSTOMER','PROVIDER')),
        "role_set_at" timestamptz,
        "phone_number" varchar(16) NOT NULL,
        "parent_name" varchar(100),
        "given_name" varchar(100),
        "email" varchar(320),
        "address" varchar(300),
        "is_verified" boolean,
        "profile_picture" varchar,
        "locale" varchar(5),
        "notify_topics" jsonb NOT NULL DEFAULT '{}',
        "plan" varchar(16) NOT NULL DEFAULT 'FREE',
        "posts_rejected" integer NOT NULL DEFAULT 0,
        "plan_expires_at" timestamptz,
        "date_created" timestamptz NOT NULL DEFAULT now(),
        "date_updated" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query('CREATE UNIQUE INDEX "UQ_users_phone_number" ON "users" ("phone_number")');
    await q.query('CREATE INDEX "IDX_users_date_created" ON "users" ("date_created" DESC)');

    await q.query(`
      CREATE TABLE "verification_session" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_session_id" varchar,
        "phone_number" varchar(16) NOT NULL,
        "code" varchar(16) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING'
          CHECK ("status" IN ('PENDING','VERIFIED','EXPIRED','CONSUMED')),
        "device_hash" varchar(64),
        "last_checked_at" timestamptz,
        "verified_at" timestamptz,
        "expires_at" timestamptz NOT NULL,
        "date_created" timestamptz NOT NULL DEFAULT now(),
        "date_updated" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query('CREATE INDEX "IDX_verification_session_provider" ON "verification_session" ("provider_session_id")');
    await q.query(
      'CREATE INDEX "IDX_verification_session_phone_status" ON "verification_session" ("phone_number","status")',
    );
    await q.query('CREATE INDEX "IDX_verification_session_expires" ON "verification_session" ("expires_at")');

    await q.query(`
      CREATE TABLE "trusted_device" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "device_hash" varchar(64) NOT NULL,
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        "date_created" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_trusted_device_user_hash" UNIQUE ("user_id","device_hash")
      )`);
    await q.query('CREATE INDEX "IDX_trusted_device_user" ON "trusted_device" ("user_id")');

    // One row per issued token (its `sid` claim). Signing out deletes the row, which ends that
    // token alone; deleting every row of an account signs it out everywhere.
    await q.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query('CREATE INDEX "IDX_auth_sessions_user" ON "auth_sessions" ("user_id")');

    // At most one per account (`owner_id` unique). Verification is granted by an admin (phase 9);
    // changing the name, registration or tax number drops it.
    await q.query(`
      CREATE TABLE "companies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "description" varchar(1000),
        "logo" varchar,
        "website" varchar(200),
        "address" varchar(300),
        "phone_number" varchar(16),
        "email" varchar(320),
        "registration_number" varchar(20),
        "tax_id" varchar(20),
        "service_area" jsonb NOT NULL DEFAULT '[]',
        "is_verified" boolean NOT NULL DEFAULT false,
        "verified_at" timestamptz,
        "date_created" timestamptz NOT NULL DEFAULT now(),
        "date_updated" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_companies_name" CHECK (length(btrim("name")) > 0)
      )
    `);
    await q.query('CREATE UNIQUE INDEX "UQ_companies_owner" ON "companies" ("owner_id")');

    // ── Categories ──────────────────────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "category_schema" (
        "id" SERIAL PRIMARY KEY,
        "key" varchar NOT NULL,
        "family" varchar NOT NULL,
        "label" varchar NOT NULL,
        "labels" jsonb NOT NULL DEFAULT '{}',
        "icon" varchar,
        "color" varchar,
        "subcategories" jsonb NOT NULL DEFAULT '[]',
        "fields" jsonb NOT NULL DEFAULT '[]',
        "has_rental_status" boolean NOT NULL DEFAULT false,
        "has_availability_dates" boolean NOT NULL DEFAULT false,
        "has_price" boolean NOT NULL DEFAULT false,
        "default_price_unit" varchar,
        "emphasized" boolean NOT NULL DEFAULT false,
        "rentable" boolean NOT NULL DEFAULT false,
        "sos" boolean NOT NULL DEFAULT false,
        "post_expiry_days" integer,
        "active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_category_schema_key" UNIQUE ("key")
      )
    `);
    await q.query('CREATE INDEX "IDX_category_schema_family" ON "category_schema" ("family")');

    // ── Listings ────────────────────────────────────────────────────────────────────────────
    // `published_at`: first approval, so a saved search counts a listing as new from then, not its draft.
    await q.query(`
      CREATE TABLE "posts" (
        "id" SERIAL PRIMARY KEY,
        "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "category" varchar NOT NULL,
        "subcategory" varchar,
        "title" varchar,
        "details" text,
        "province" varchar,
        "district" varchar,
        "address" varchar,
        "latitude" double precision,
        "longitude" double precision,
        "geo" geography(Point,4326) GENERATED ALWAYS AS (
          CASE WHEN "latitude" IS NOT NULL AND "longitude" IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography END
        ) STORED,
        "location" varchar,
        "price_amount" numeric(15,2),
        "price_unit" varchar,
        "contact_phone" varchar,
        "contact_email" varchar,
        "available_from" timestamptz,
        "available_until" timestamptz,
        "website" varchar,
        "images" jsonb NOT NULL DEFAULT '[]',
        "attributes" jsonb NOT NULL DEFAULT '{}',
        "views" integer NOT NULL DEFAULT 0,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "approval_status" varchar NOT NULL DEFAULT 'PENDING',
        "is_draft" boolean NOT NULL DEFAULT false,
        "rejection_reason" text,
        "rejection_field" varchar,
        "previous_snapshot" jsonb,
        "pending_revision" jsonb,
        "published_at" timestamptz,
        "expires_at" timestamptz,
        "expiry_warned_at" timestamptz,
        "featured_until" timestamptz,
        "is_featured" boolean NOT NULL DEFAULT false,
        "deleted_at" timestamptz,
        "search_vector" tsvector GENERATED ALWAYS AS (${SEARCH_VECTOR}) STORED,
        "date_created" timestamptz NOT NULL DEFAULT now(),
        "date_updated" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX "IDX_posts_user" ON "posts" ("user_id")');
    await q.query('CREATE INDEX "IDX_posts_category_approval" ON "posts" ("category", "approval_status")');
    await q.query('CREATE INDEX "IDX_posts_browse_order" ON "posts" ("approval_status", "is_featured", "date_created")');
    // Every OR arm of a search term must be indexable, or the planner scans (see searchSql).
    await q.query('CREATE INDEX "IDX_posts_subcategory" ON "posts" ("subcategory")');
    await q.query('CREATE INDEX "IDX_posts_province" ON "posts" ("province")');
    await q.query('CREATE INDEX "IDX_posts_district" ON "posts" ("district")');
    await q.query('CREATE INDEX "IDX_posts_expires" ON "posts" ("expires_at") WHERE "status" <> \'EXPIRED\'');
    await q.query('CREATE INDEX "IDX_posts_pending_revision" ON "posts" ("id") WHERE "pending_revision" IS NOT NULL');
    await q.query('CREATE INDEX "IDX_posts_attributes_gin" ON "posts" USING GIN ("attributes" jsonb_path_ops)');
    await q.query('CREATE INDEX "IDX_posts_search_vector" ON "posts" USING GIN ("search_vector")');
    // The fuzzy retry's `:term <% lower(title)` (pg_trgm word similarity, threshold set per connection).
    await q.query('CREATE INDEX "IDX_posts_title_trgm" ON "posts" USING GIN (lower("title") gin_trgm_ops)');
    await q.query('CREATE INDEX "IDX_posts_geo" ON "posts" USING GIST ("geo")');

    // One per viewer per listing, ever; `counted` is false for the owner and admins.
    await q.query(`
      CREATE TABLE "post_views" (
        "id" SERIAL PRIMARY KEY,
        "post_id" integer NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
        "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
        "visitor_key" varchar(64),
        "ip_key" varchar(64),
        "counted" boolean NOT NULL DEFAULT false,
        "date_viewed" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE UNIQUE INDEX "UQ_post_views_user" ON "post_views" ("post_id", "user_id") WHERE "user_id" IS NOT NULL');
    await q.query(
      'CREATE UNIQUE INDEX "UQ_post_views_visitor" ON "post_views" ("post_id", "visitor_key") WHERE "visitor_key" IS NOT NULL',
    );
    await q.query('CREATE INDEX "IDX_post_views_ip" ON "post_views" ("post_id", "ip_key", "date_viewed") WHERE "ip_key" IS NOT NULL');
    // The performance windows read counted views by date.
    await q.query('CREATE INDEX "IDX_post_views_post_date" ON "post_views" ("post_id", "date_viewed") WHERE "counted"');

    // An account's saved listings (guests keep theirs on the device and merge them at sign-in).
    await q.query(`
      CREATE TABLE "post_likes" (
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "post_id" integer NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "post_id")
      )
    `);
    await q.query('CREATE INDEX "IDX_post_likes_post" ON "post_likes" ("post_id")');

    // A call tapped, a Чат opened or a booking requested. One row per viewer per kind per
    // Ulaanbaatar day (`day` is written by the engine), so five taps on Call count once.
    await q.query(`
      CREATE TABLE "post_contacts" (
        "id" SERIAL PRIMARY KEY,
        "post_id" integer NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
        "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "viewer" varchar(64) NOT NULL,
        "ip_key" varchar(64),
        "kind" varchar(16) NOT NULL,
        "day" date NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_post_contacts_kind" CHECK ("kind" IN ('CALL','CHAT','BOOKING'))
      )
    `);
    await q.query('CREATE UNIQUE INDEX "UQ_post_contacts_viewer_day" ON "post_contacts" ("post_id", "kind", "viewer", "day")');
    await q.query('CREATE INDEX "IDX_post_contacts_post_created" ON "post_contacts" ("post_id", "created_at")');
    // Anonymous taps per address per listing per day are capped (a script rotating device ids).
    await q.query('CREATE INDEX "IDX_post_contacts_ip_day" ON "post_contacts" ("post_id", "kind", "ip_key", "day") WHERE "ip_key" IS NOT NULL');

    // Up to ten named `GET /posts` parameter sets per account. `last_seen_at` drives the
    // "N new" count; `notify` and `last_notified_at` are read by the alerts.
    await q.query(`
      CREATE TABLE "saved_searches" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(80) NOT NULL,
        "params" jsonb NOT NULL DEFAULT '{}',
        "notify" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        "last_notified_at" timestamptz
      )
    `);
    await q.query('CREATE INDEX "IDX_saved_searches_user" ON "saved_searches" ("user_id", "created_at")');

    // ── Deals ───────────────────────────────────────────────────────────────────────────────
    // A request for days on a rentable listing. It outlives the listing (`post_id` is set null), so
    // the title, category and price are copied at request time. One PENDING request per customer
    // per listing; accepted days live in `post_busy`.
    await q.query(`
      CREATE TABLE "bookings" (
        "id" SERIAL PRIMARY KEY,
        "post_id" integer REFERENCES "posts"("id") ON DELETE SET NULL,
        "customer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "post_title" varchar,
        "category" varchar NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "price_amount" numeric(14,2),
        "price_unit" varchar(16),
        "message" varchar(1000),
        "address" varchar(200),
        "start_time" varchar(5),
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "closed_reason" varchar(16),
        "response_message" varchar(1000),
        "responded_at" timestamptz,
        "reminded_at" timestamptz,
        "review_prompted_at" timestamptz,
        "date_created" timestamptz NOT NULL DEFAULT now(),
        "date_updated" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_bookings_status" CHECK ("status" IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','EXPIRED')),
        CONSTRAINT "CHK_bookings_dates" CHECK ("end_date" >= "start_date"),
        CONSTRAINT "CHK_bookings_parties" CHECK ("customer_id" <> "provider_id")
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "UQ_bookings_one_pending" ON "bookings" ("customer_id", "post_id") WHERE "status" = 'PENDING'`);
    await q.query('CREATE INDEX "IDX_bookings_customer" ON "bookings" ("customer_id", "start_date")');
    await q.query('CREATE INDEX "IDX_bookings_provider" ON "bookings" ("provider_id", "status", "start_date")');
    await q.query('CREATE INDEX "IDX_bookings_post_status" ON "bookings" ("post_id", "status")');

    // The days a listing is not free. BOOKED rows come from accepted bookings and may not overlap
    // on one listing (the exclusion constraint makes accept race-safe); BLOCKED rows are the
    // provider's own. Browse's dates filter excludes a listing with any row overlapping the range.
    await q.query(`
      CREATE TABLE "post_busy" (
        "id" SERIAL PRIMARY KEY,
        "post_id" integer NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
        "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "kind" varchar NOT NULL,
        "booking_id" integer,
        "days" daterange NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_post_busy_kind" CHECK ("kind" IN ('BOOKED', 'BLOCKED')),
        CONSTRAINT "CHK_post_busy_days" CHECK (NOT isempty("days")),
        CONSTRAINT "EXCL_post_busy_booked" EXCLUDE USING GIST ("post_id" WITH =, "days" WITH &&) WHERE ("kind" = 'BOOKED'),
        CONSTRAINT "FK_post_busy_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE
      )
    `);
    await q.query('CREATE INDEX "IDX_post_busy_post_days" ON "post_busy" USING GIST ("post_id", "days")');
    await q.query('CREATE INDEX "IDX_post_busy_booking" ON "post_busy" ("booking_id") WHERE "booking_id" IS NOT NULL');

    // Чат: one thread per listing and customer. `first_customer_at`/`first_reply_at` measure the
    // provider's reply time (only typed text counts as a reply).
    await q.query(`
      CREATE TABLE "conversations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "post_id" integer REFERENCES "posts"("id") ON DELETE SET NULL,
        "post_title" varchar,
        "customer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "last_message_at" timestamptz,
        "last_message_preview" varchar(140),
        "last_message_kind" varchar(24),
        "last_sender_id" uuid,
        "customer_unread" integer NOT NULL DEFAULT 0,
        "provider_unread" integer NOT NULL DEFAULT 0,
        "first_customer_at" timestamptz,
        "first_reply_at" timestamptz,
        "date_created" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_conversations_parties" CHECK ("customer_id" <> "provider_id")
      )
    `);
    await q.query('CREATE UNIQUE INDEX "UQ_conversations_post_customer" ON "conversations" ("post_id", "customer_id") WHERE "post_id" IS NOT NULL');
    await q.query('CREATE INDEX "IDX_conversations_customer" ON "conversations" ("customer_id", "last_message_at" DESC)');
    await q.query('CREATE INDEX "IDX_conversations_provider" ON "conversations" ("provider_id", "last_message_at" DESC)');
    await q.query('CREATE INDEX "IDX_conversations_reply" ON "conversations" ("provider_id", "first_customer_at") WHERE "first_reply_at" IS NOT NULL');

    // Typed text or a booking step (`kind`), newest-first paging on (date_created, id).
    await q.query(`
      CREATE TABLE "messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
        "sender_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "kind" varchar(24) NOT NULL DEFAULT 'TEXT',
        "body" varchar(2000) NOT NULL DEFAULT '',
        "booking_id" integer REFERENCES "bookings"("id") ON DELETE SET NULL,
        "read_at" timestamptz,
        -- Millisecond precision: the page cursor travels as a JSON timestamp, which has no microseconds.
        "date_created" timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_messages_kind" CHECK ("kind" IN ('TEXT','BOOKING_REQUESTED','BOOKING_ACCEPTED','BOOKING_DECLINED','BOOKING_CANCELLED'))
      )
    `);
    await q.query('CREATE INDEX "IDX_messages_conversation" ON "messages" ("conversation_id", "date_created" DESC, "id" DESC)');

    // One per author and provider (an upsert), with the provider's one public reply.
    await q.query(`
      CREATE TABLE "reviews" (
        "id" SERIAL PRIMARY KEY,
        "provider_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "rating" smallint NOT NULL,
        "comment" varchar(1000),
        "reply" varchar(1000),
        "reply_at" timestamptz,
        "date_created" timestamptz NOT NULL DEFAULT now(),
        "date_updated" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5),
        CONSTRAINT "CHK_reviews_parties" CHECK ("provider_id" <> "author_id")
      )
    `);
    await q.query('CREATE UNIQUE INDEX "UQ_reviews_provider_author" ON "reviews" ("provider_id", "author_id")');
    await q.query('CREATE INDEX "IDX_reviews_provider_created" ON "reviews" ("provider_id", "date_created" DESC)');

    // ── Notifications ───────────────────────────────────────────────────────────────────────
    // The centre (Figma I3). `data` holds the facts copied at the event; the words are rendered
    // from `kind` + `data` in the reader's language. `group_key` folds repeats into one unread row
    // (a saved search's new matches): one unread row per user per key.
    await q.query(`
      CREATE TABLE "notifications" (
        "id" BIGSERIAL PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "kind" varchar(32) NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}',
        "group_key" varchar(64),
        "read_at" timestamptz(3),
        "created_at" timestamptz(3) NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX "IDX_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC, "id" DESC)');
    await q.query('CREATE INDEX "IDX_notifications_user_unread" ON "notifications" ("user_id") WHERE "read_at" IS NULL');
    await q.query('CREATE UNIQUE INDEX "UQ_notifications_unread_group" ON "notifications" ("user_id", "group_key") WHERE "read_at" IS NULL AND "group_key" IS NOT NULL');

    // Every event is written here before it is fanned out and deleted once it is; a restart
    // mid-send leaves the row for the minute sweep. `claimed_at` makes one worker the sender,
    // `sent` is how many of its planned notifications went out (a retry resumes there).
    await q.query(`
      CREATE TABLE "notification_outbox" (
        "id" BIGSERIAL PRIMARY KEY,
        "event" jsonb NOT NULL,
        "sent" int NOT NULL DEFAULT 0,
        "attempts" int NOT NULL DEFAULT 0,
        "claimed_at" timestamptz(3),
        "last_error" text,
        "created_at" timestamptz(3) NOT NULL DEFAULT now()
      )
    `);

    // An Expo token or a browser's push subscription (`token` = endpoint, `keys`), with the
    // language its copy is written in. A token moves to whoever registers it last.
    await q.query(`
      CREATE TABLE "push_devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider" varchar(8) NOT NULL,
        "token" text NOT NULL,
        "keys" jsonb,
        "locale" varchar(5) NOT NULL DEFAULT 'mn',
        "platform" varchar(16),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_push_devices_provider" CHECK ("provider" IN ('EXPO','WEB'))
      )
    `);
    await q.query('CREATE UNIQUE INDEX "UQ_push_devices_token" ON "push_devices" ("token")');
    await q.query('CREATE INDEX "IDX_push_devices_user" ON "push_devices" ("user_id")');
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'push_devices', 'notification_outbox', 'notifications', 'reviews', 'messages', 'conversations', 'post_busy', 'bookings',
      'saved_searches', 'post_contacts', 'post_likes', 'post_views', 'posts', 'category_schema',
      'companies', 'auth_sessions', 'trusted_device', 'verification_session', 'users',
    ]) {
      await q.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
