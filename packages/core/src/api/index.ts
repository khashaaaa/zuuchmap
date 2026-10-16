// API types shared by the engine and both clients. Dates
// arrive as ISO strings over JSON; Postgres decimals as strings.
import type {
  ApprovalStatus, BookingStatus, ErrorCode, PaymentKind, PaymentProvider, PaymentStatus,
  Plan, PriceUnit, ReportKind, ReportReason, ReportStatus, Status, UserType,
} from '../enums/index.js';
import type { Locale } from '../i18n/meta.js';

export type ISODate = string;

export interface Paginated<T> { items: T[]; total: number }
/** Per-field issue on a 400 (`INVALID_ATTRIBUTES`): `key` is the attribute, `code` e.g. `required`. */
export interface FieldIssue { key: string; code: string; message: string }
export interface ApiError { code: ErrorCode; message?: string; errors?: FieldIssue[] }

export interface PublicUser {
  id: string;
  type: UserType | null;
  phone_number: string | null;
  parent_name: string | null;
  given_name: string | null;
  email: string | null;
  profile_picture: string | null;
  is_verified: boolean | null;
  date_created: ISODate;
  company?: PublicCompany | null;
  /** Seller trust, on listing owners, threads and the seller page. Null average below one review. */
  rating_average?: number | null;
  rating_count?: number;
  /** Median minutes to a first reply over 30 days; null below REPLY_TIME_MIN_THREADS threads. */
  reply_minutes?: number | null;
}

/** Threads a provider must have answered in 30 days before a reply time is shown. */
export const REPLY_TIME_MIN_THREADS = 3;

export interface User extends PublicUser {
  address: string | null;
  plan: Plan;
  plan_expires_at: ISODate | null;
  posts_rejected: number;
  company?: Company | null;
  date_updated: ISODate;
  /** Set by the auth response, never stored. */
  is_admin?: boolean;
}

export interface Company {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  website: string | null;
  address: string | null;
  phone_number: string | null;
  email: string | null;
  /** Owner/admin responses only. */
  registration_number?: string | null;
  tax_id?: string | null;
  /** Province codes the company serves (seller page "Үйлчлэх бүс"). */
  service_area: string[];
  is_verified: boolean | null;
  date_created: ISODate;
  date_updated: ISODate;
}
export type PublicCompany = Omit<Company, 'registration_number' | 'tax_id'>;

export interface PostSnapshot {
  title: string | null;
  details: string | null;
  price: number | null;
  price_unit: string | null;
  attributes: Record<string, unknown> | null;
  images: string[];
  subcategory: string | null;
  province: string | null;
  district: string | null;
}

export interface ListingRevision {
  title: string | null;
  details: string | null;
  subcategory: string | null;
  province: string | null;
  district: string | null;
  address: string | null;
  location: string | null;
  price_unit: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  price_amount: number | null;
  attributes: Record<string, unknown> | null;
  images: string[];
  submitted_at: string;
}

export interface ListingListItem {
  id: number;
  category: string;
  subcategory: string | null;
  title: string | null;
  province: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  /** Postgres decimal: a string over the wire. */
  price_amount: string | number | null;
  price_unit: PriceUnit | string | null;
  contact_phone: string | null;
  contact_email: string | null;
  available_from: ISODate | null;
  available_until: ISODate | null;
  website: string | null;
  images: string[] | null;
  attributes: Record<string, unknown> | null;
  views: number;
  status: Status | string | null;
  approval_status: ApprovalStatus | string | null;
  expires_at: ISODate | null;
  featured_until: ISODate | null;
  is_featured: boolean;
  /** The next 14 days that are booked or blocked (`YYYY-MM-DD`), on rentable categories only. */
  busy_dates?: string[];
  /** Metres from the viewer, when the search carried `lat`/`lng`; null for a listing without a pin. */
  distance_m?: number | null;
  user: PublicUser | null;
  date_created: ISODate;
  date_updated: ISODate;
}

export type BrowseSort = 'relevance' | 'newest' | 'nearby' | 'price_asc' | 'price_desc';

/**
 * `GET /posts` query. Dates exclude listings booked or blocked on any of those days;
 * `price_min`/`price_max` apply within `price_unit` only (other units are left out);
 * `nearby` needs `lat`/`lng`; `attr.<key>`, `attr.<key>_min`, `attr.<key>_max` filter schema fields.
 */
export interface ListingSearchParams {
  q?: string;
  family?: string;
  category?: string;
  subcategory?: string;
  province?: string;
  district?: string;
  /** `YYYY-MM-DD`, inclusive. */
  date_from?: string;
  date_to?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  price_min?: number;
  price_max?: number;
  price_unit?: PriceUnit;
  sort?: BrowseSort;
  page?: number;
  limit?: number;
}

/** `GET /posts`: `relaxed` says the query as typed found nothing and a looser match was returned. */
export interface BrowseResponse extends Paginated<ListingListItem> {
  relaxed: boolean;
  /** Only when dates were asked and nothing is free on them: how many match without dates. */
  undated_total?: number;
  /** Only with `undated_total`: the nearest later windows of the same length with free listings. */
  alternatives?: BrowseAlternative[];
}
export interface BrowseAlternative { date_from: string; date_to: string; count: number }

/** `GET /posts/map` pin: one listing in the viewport. */
export interface MapPin {
  id: number;
  lat: number;
  lng: number;
  category: string;
  price_amount: string | number | null;
  price_unit: PriceUnit | string | null;
  is_featured: boolean;
}
/** Several listings sharing a grid cell at this zoom; `id` is the cell key for a stable React key. */
export interface MapCluster { id: string; lat: number; lng: number; count: number }
/** `GET /posts/map?bbox=w,s,e,n&zoom=z` plus the browse filters. `total` counts every listing in the viewport. */
export interface MapResponse { pins: MapPin[]; clusters: MapCluster[]; total: number }

export type BusyKind = 'BOOKED' | 'BLOCKED';
/** A day range a listing is not free on, `YYYY-MM-DD` inclusive. */
export interface BusyRange { id: number; start_date: string; end_date: string; kind: BusyKind }
/** `GET /posts/:id/availability?from&to` (default: today + 90 days). */
export interface AvailabilityResponse { busy: BusyRange[] }
/** `POST /posts/availability/block`: one range on several of the caller's listings. */
export interface BlockDaysRequest { post_ids: number[]; start_date: string; end_date: string }
export interface BlockDaysResponse { blocked: Array<BusyRange & { post_id: number }> }

/** `GET /posts/:id` (the only route that returns `details`). */
export interface Listing extends ListingListItem {
  details: string | null;
  /** Owner/admin responses only. */
  previous_snapshot?: PostSnapshot | null;
  like_count: number;
  /** Whether the signed-in viewer saved it; false for a guest. */
  liked: boolean;
  /** The signed-in viewer's PENDING request on this listing (one at most); null for a guest. */
  my_pending_booking_id: number | null;
  /** Owner/admin responses only. */
  pending_revision?: ListingRevision | null;
  rejection_reason?: string | null;
  rejection_field?: string | null;
  /** Owner/admin responses only. */
  is_draft?: boolean;
}

/** `GET /posts/mine` item: the owner's own view, moderation state included. */
export interface MyListingItem extends ListingListItem {
  is_draft: boolean;
  rejection_reason: string | null;
  /** The wizard field the client should open on after a rejection. */
  rejection_field: string | null;
  pending_revision: ListingRevision | null;
  previous_snapshot: PostSnapshot | null;
  /** Days a renewal (or publication) keeps it live: the category's window, lengthened by the plan. */
  renew_days: number;
}

/** One changed field of a pending edit, as the moderation screen shows it. */
export interface ListingEditDiff {
  field: string;
  before: unknown;
  after: unknown;
}

/** `GET /admin/posts` item: the full listing plus what its pending edit changes. */
export interface AdminListing extends Listing {
  is_draft: boolean;
  edit_diff: ListingEditDiff[] | null;
}

/** Body shared by `POST /posts` and `PATCH|PUT /posts/:id` (category is create-only). */
export interface ListingWriteRequest {
  category?: string;
  subcategory?: string | null;
  title?: string;
  details?: string | null;
  province?: string | null;
  district?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location?: string | null;
  price_amount?: number | null;
  price_unit?: PriceUnit | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  available_from?: ISODate | null;
  available_until?: ISODate | null;
  website?: string | null;
  status?: 'ACTIVE' | 'RENTED';
  attributes?: Record<string, unknown>;
  /** Photo keys from an upload intent; the engine never stores URLs. */
  images?: string[];
  /** Create only: save without submitting to moderation or using quota. */
  draft?: boolean;
  /** Update of a draft only: save these fields, then send it for review, in one request. */
  submit?: boolean;
}

/** `POST /admin/posts/:id/reject`. */
export interface RejectListingRequest {
  reason: string;
  /** A base field or a category field key; the client opens the wizard on it. */
  field_key?: string | null;
}

/** `POST /posts/photos/intent`. */
export interface PhotoIntentRequest { content_type: 'image/jpeg' | 'image/png' | 'image/webp' }
export interface PhotoIntent {
  key: string;
  upload_url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expires_in: number;
}

/** `POST /posts/photos` (multipart, field `files`, up to 10): one entry per file, in order. */
export interface PhotoUploaded {
  /** Send this in `images` on create/edit. */
  key: string;
  /** Same key with `_thumb` before the extension (extension kept). */
  thumb_key: string;
  url: string;
  thumb_url: string;
}
export interface PhotoUploadResponse { photos: PhotoUploaded[] }

/** `PUT /posts/:id/views`. */
export interface ListingViewResponse { counted: boolean }

export interface MyListingStatsItem {
  id: number;
  title: string | null;
  approval_status: ApprovalStatus | string | null;
  status: Status | string | null;
  views: number;
  saves: number;
  /** Calls, chats opened and booking requests, lifetime. */
  contacts: number;
}

/** `GET /posts/mine/stats`. */
export interface MyListingStats {
  totals: { posts: number; views: number; saves: number; contacts: number };
  posts: MyListingStatsItem[];
  plan: PlanUsage;
}

/** The caller's plan and how much of it live listings use. */
export interface PlanUsage { name: Plan; post_limit: number; active_posts: number; expires_at: ISODate | null }

/** `GET /notifications/badges`: what the shell shows on every screen, in one request. `plan` is null for a customer. */
export interface Badges { notifications: number; chat: number; plan: PlanUsage | null }

/** What counts as a contact: a call tapped, a Чат opened, a booking requested. */
export type ContactKind = 'CALL' | 'CHAT' | 'BOOKING';
/** `POST /posts/:id/contact` (clients send CALL; CHAT and BOOKING are recorded by the engine). */
export interface ContactRequest { kind: 'CALL' }

/** One window of a listing's audience. */
export interface PerformanceWindow { views: number; saves: number; contacts: number; booking_requests: number }
export interface ListingPerformance {
  id: number;
  title: string | null;
  /** The last `days` days, and the `days` before them. */
  current: PerformanceWindow;
  previous: PerformanceWindow;
}
/** `GET /posts/mine/performance?days=7`: every listing of the caller's, busiest first. */
export interface MyPerformance {
  days: number;
  totals: { current: PerformanceWindow; previous: PerformanceWindow };
  posts: ListingPerformance[];
}
/** `GET /posts/:id/performance` (owner): E6. */
export interface ListingPerformanceDetail extends ListingPerformance {
  days: number;
  pending_requests: number;
  /** Whole days until it lapses; null without an expiry. */
  days_left: number | null;
}

/** `GET /provider/home`: E1, what needs the provider now. */
export interface ProviderHome {
  pending_requests: { count: number; oldest_at: ISODate | null };
  /** Threads where the provider has unread messages. */
  unread_chats: { count: number; reply_minutes: number | null };
  /** Rejected listings, and live ones whose edit was refused: open the wizard on `rejection_field`. */
  to_fix: Array<{ id: number; title: string | null; rejection_reason: string | null; rejection_field: string | null; revision: boolean }>;
  /** Live listings lapsing within EXPIRY_WARNING_DAYS. */
  expiring: Array<{ id: number; title: string | null; expires_at: ISODate }>;
  unanswered_reviews: number;
  booking_value: { month: string; total: number; count: number };
  week: MyPerformance;
  /** The account screen's numbers, so it needs no other request. */
  rating: { average: number | null; count: number };
  company: Company | null;
  listings: { total: number; live: number };
  plan: PlanUsage;
}

/** `GET /bookings/value?month=YYYY-MM`: E16. Customers pay providers directly: booking value, never income. */
export interface BookingValue { month: string; total: number; count: number; items: Booking[] }

/** `POST /company` and `PATCH /company`. */
export interface CompanyWriteRequest {
  name?: string;
  description?: string | null;
  website?: string | null;
  address?: string | null;
  phone_number?: string | null;
  email?: string | null;
  registration_number?: string | null;
  tax_id?: string | null;
  service_area?: string[];
}
/** `GET /company/mine`. */
export interface MyCompanyResponse { company: Company | null }

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'phone' | 'boolean' | 'multiselect';
export type LocalizedLabels = Record<string, string>;

export interface FieldDef {
  key: string;
  label: string;
  labels?: LocalizedLabels;
  type: FieldType;
  options?: string[];
  required?: boolean;
  group?: 'core' | 'details';
  placeholder?: string;
  placeholders?: LocalizedLabels;
  filterable?: boolean;
  unit?: string;
  /** Number fields only; inclusive bounds enforced by the engine. */
  min?: number;
  max?: number;
}

export interface CategorySchema {
  id: number;
  key: string;
  label: string;
  labels: LocalizedLabels | null;
  icon: string | null;
  color: string | null;
  subcategories: Array<{ value: string; display: string; labels?: LocalizedLabels }> | null;
  fields: FieldDef[] | null;
  has_rental_status: boolean;
  has_availability_dates: boolean;
  has_price: boolean;
  default_price_unit: string | null;
  emphasized: boolean;
  post_expiry_days: number | null;
  active: boolean;
  sort_order: number;
  created_at: ISODate;
  /** Family key (EQUIPMENT_VEHICLES | MATERIALS_PRODUCTION | SERVICES | JOBS). */
  family?: string;
  /** Rentable listings get Book as the primary action. */
  rentable?: boolean;
  /** SOS listings are pinned with call-now. */
  sos?: boolean;
  updated_at?: ISODate;
}

/** A listing's primary action: rentable => BOOK, SOS => CALL_NOW (pinned), default CALL. */
export type PrimaryAction = 'BOOK' | 'CALL' | 'CALL_NOW';

export interface CategoryFieldView extends Omit<FieldDef, 'labels' | 'placeholders'> {
  /** Resolved for the requested locale. */
  label: string;
  placeholder?: string;
}

/** `GET /categories` item: a schema localized for one locale. */
export interface CategoryView {
  key: string;
  family: string;
  family_label: string;
  label: string;
  /** A Lucide name the clients ship; unknown admin-set names are already replaced by the family icon. */
  icon: string;
  color: string | null;
  subcategories: Array<{ value: string; label: string }>;
  fields: CategoryFieldView[];
  has_rental_status: boolean;
  has_availability_dates: boolean;
  has_price: boolean;
  default_price_unit: string | null;
  emphasized: boolean;
  rentable: boolean;
  sos: boolean;
  pinned: boolean;
  primary_action: PrimaryAction;
  post_expiry_days: number | null;
  sort_order: number;
}

/** A family with its categories, as `GET /categories` carries it. */
export interface CategoryFamilyView {
  key: string;
  icon: string;
  label: string;
  categories: string[];
  /** Active listings across the family's categories. */
  count: number;
}
/** `GET /categories?lang=`: the active categories and the four families, in one request. */
export interface CategoriesResponse { categories: CategoryView[]; families: CategoryFamilyView[] }

/** Who a booking or thread is with, from the viewer's side. */
export type DealRole = 'CUSTOMER' | 'PROVIDER';
/** Why a request closed without its provider answering it. */
export type BookingClosedReason = 'OVERLAP';

/**
 * A booking request and its answer. `post` is null once the listing is gone (the booking outlives
 * it; `post_title`/`category`/prices are copied at request time). `contact_phone` is the other
 * side's number and is set only once ACCEPTED.
 */
export interface Booking {
  id: number;
  post_id: number | null;
  post: ListingListItem | null;
  post_title: string | null;
  category: string;
  /** The viewer's side of this booking. */
  role: DealRole;
  customer: PublicUser;
  provider: PublicUser;
  /** `YYYY-MM-DD`, inclusive. */
  start_date: string;
  end_date: string;
  days: number;
  price_amount: string | number | null;
  price_unit: PriceUnit | string | null;
  /** Per-day price times `days`; null for any other unit. */
  total: number | null;
  message: string | null;
  /** Where the work is, as the customer wrote it. */
  address: string | null;
  /** `HH:MM`, the start time the customer asked for. */
  start_time: string | null;
  status: BookingStatus;
  closed_reason: BookingClosedReason | null;
  response_message: string | null;
  responded_at: ISODate | null;
  contact_phone: string | null;
  /** The thread between the two about this listing, when one exists. */
  conversation_id: string | null;
  /** Customer side: finished, and no review of this provider yet. */
  can_review: boolean;
  /** Provider side, PENDING only: other pending requests on the same listing that overlap these days. */
  conflicts: number[];
  date_created: ISODate;
  date_updated: ISODate;
}

/** `POST /bookings`. */
export interface BookingCreateRequest {
  post_id: number;
  start_date: string;
  end_date: string;
  message?: string;
  address?: string;
  start_time?: string;
}
/** `PUT /bookings/:id/accept|decline`. */
export interface BookingAnswerRequest { response_message?: string }

export type MyBookingsTab = 'active' | 'past';
export type ReceivedBookingsTab = 'new' | 'accepted' | 'past';
/** `GET /bookings/mine?tab` (customer) and `GET /bookings/received?tab` (provider): one tab plus every tab's count. */
export interface BookingList<Tab extends string> extends Paginated<Booking> {
  counts: Record<Tab, number>;
}

export interface Review {
  id: number;
  provider_id: string;
  author: PublicUser;
  /** 1–5. */
  rating: number;
  comment: string | null;
  /** The provider's one public reply. */
  reply: string | null;
  reply_at: ISODate | null;
  date_created: ISODate;
  date_updated: ISODate;
}
/** `POST /reviews` (an upsert: one review per author and provider). */
export interface ReviewWriteRequest { provider_id: string; rating: number; comment?: string | null }
/** `PUT /reviews/:id/reply`. */
export interface ReviewReplyRequest { reply: string }
export type ReviewSort = 'new' | 'high' | 'low';
/** `GET /reviews/provider/:id?sort&page&limit`. */
export interface ProviderReviews extends Paginated<Review> {
  average: number | null;
  count: number;
  /** Reviews per star, `'1'`–`'5'`. */
  stats: Record<'1' | '2' | '3' | '4' | '5', number>;
  /** The viewer's own review of this provider. */
  own: Review | null;
  /** Whether the viewer may write (or edit) one: a finished booking or a thread the provider answered. */
  can_review: boolean;
}

/** `GET /sellers/:id`: the seller page. */
export interface SellerProfile {
  user: PublicUser;
  /** Accepted bookings that have ended. */
  jobs: number;
  listings: ListingListItem[];
  /** The newest three; the rest are `GET /reviews/provider/:id`. */
  reviews: Review[];
}

/** What a message is: typed text, or a booking step the clients word themselves. */
export type MessageKind = 'TEXT' | 'BOOKING_REQUESTED' | 'BOOKING_ACCEPTED' | 'BOOKING_DECLINED' | 'BOOKING_CANCELLED';

export interface Conversation {
  id: string;
  post_id: number | null;
  post: ListingListItem | null;
  post_title: string | null;
  /** The viewer's side of this thread. */
  role: DealRole;
  /** The other person, with `reply_minutes` when they are the provider. */
  other: PublicUser;
  last_message_at: ISODate | null;
  last_message_preview: string | null;
  last_message_kind: MessageKind | null;
  last_message_mine: boolean;
  /** Unread for the viewer. */
  unread: number;
  date_created: ISODate;
}

export interface Message {
  id: string;
  conversation_id: string;
  /** Null once the sender's account is gone. */
  sender_id: string | null;
  kind: MessageKind;
  body: string;
  booking_id: number | null;
  read_at: ISODate | null;
  date_created: ISODate;
}

/** `POST /conversations`: opens the thread about a listing, or returns the existing one. */
export interface ConversationOpenRequest { post_id: number; body?: string }
export interface ConversationOpenResponse { conversation: Conversation; message: Message | null }
export interface MessageSendRequest { body: string }
/** Page sizes: conversations by `before` (ISO of `last_message_at`), messages by `before`+`before_id`, newest first. */
export const CONVERSATIONS_PAGE = 50;
export const MESSAGES_PAGE = 30;
export const MESSAGE_MAX_LENGTH = 2000;

/** Socket events, server to client. Rooms are `user:<id>`; each goes to the one person it concerns. */
export const SOCKET_EVENTS = {
  MESSAGE_CREATED: 'message.created',
  CONVERSATION_READ: 'conversation.read',
  BOOKING_UPDATED: 'booking.updated',
  NOTIFICATION_CREATED: 'notification.created',
} as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
export interface MessageCreatedPayload { conversation_id: string; message: Message }
export interface ConversationReadPayload { conversation_id: string; read_at: ISODate }
/** The stored row; for an updated SAVED_SEARCH_MATCH the same id arrives again with a new count. */
export type NotificationCreatedPayload = AppNotification;
export interface BookingUpdatedPayload { booking_id: number; status: BookingStatus; role: DealRole }

export interface Report {
  id: string;
  reporter: PublicUser | null;
  post: ListingListItem | null;
  review: Review | null;
  kind: ReportKind;
  owner: PublicUser | null;
  subject: string | null;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  resolution: string | null;
  resolved_at: ISODate | null;
  date_created: ISODate;
  date_updated: ISODate;
}

/** What a saved search remembers of `GET /posts`: no dates, no viewer location, no paging. */
export interface SavedSearchParams {
  q?: string;
  family?: string;
  category?: string;
  subcategory?: string;
  province?: string;
  district?: string;
  price_min?: number;
  price_max?: number;
  price_unit?: PriceUnit | string;
  /** `attr.<key>` filters, keyed without the prefix (`_min`/`_max` suffixes kept). */
  attrs?: Record<string, string>;
}
/** `GET /saved-searches` item. */
export interface SavedSearch {
  id: string;
  name: string;
  params: SavedSearchParams;
  /** Alerts on (phase 7 sends them); off keeps the search without alerts. */
  notify: boolean;
  /** Live listings matching since the search was last opened (capped at 99). */
  new_count: number;
  created_at: ISODate;
  last_seen_at: ISODate;
  last_notified_at: ISODate | null;
}
/** `POST /saved-searches`; at most SAVED_SEARCH_LIMIT per account (400 SAVED_SEARCH_LIMIT). */
export interface SavedSearchWriteRequest { name: string; params: SavedSearchParams; notify?: boolean }
/** `PATCH /saved-searches/:id`. */
export interface SavedSearchUpdateRequest { name?: string; notify?: boolean }
export const SAVED_SEARCH_LIMIT = 10;
/** `POST /likes` (201, idempotent) and `DELETE /likes/:post_id`. */
export interface LikeRequest { post_id: number }
export interface LikeResponse { liked: boolean; like_count: number }
/** `POST /likes/merge`: a guest's on-device saves, added at sign-in; answers every saved id. */
export interface MergeLikesRequest { post_ids: number[] }
export interface LikeIdsResponse { ids: number[] }
/** `GET /posts/stats`: the landing counters (cached five minutes). */
export const LANDING_REPLY_MIN_THREADS = 5;
export interface LandingStats {
  /** Live listings. */
  total: number;
  /** Provinces with at least one live listing. */
  provinces: number;
  /** Providers with a verified company (0 until companies exist). */
  verified_providers: number;
  /** Median first-reply hours over 30 days across providers; null below LANDING_REPLY_MIN_THREADS threads. */
  reply_hours: number | null;
  families: Array<{ key: string; count: number }>;
  categories: Array<{ key: string; count: number }>;
}
export interface Payment {
  id: string;
  kind: PaymentKind;
  plan: Plan | null;
  months: number;
  post: ListingListItem | null;
  days: number | null;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  provider_invoice_id: string | null;
  reference: string | null;
  paid_at: ISODate | null;
  granted_at: ISODate | null;
  note: string | null;
  date_created: ISODate;
  date_updated: ISODate;
}

// ---- Notifications (phase 7) ----

/** What a stored notification is about. `MESSAGE_CREATED` is pushed but never stored: Чат keeps its own unread state. */
export const NOTIFICATION_KINDS = [
  'LISTING_SUBMITTED', 'LISTING_APPROVED', 'LISTING_REJECTED', 'LISTING_EXPIRING', 'LISTING_EXPIRED',
  'BOOKING_REQUESTED', 'BOOKING_ACCEPTED', 'BOOKING_DECLINED', 'BOOKING_CANCELLED', 'BOOKING_EXPIRED', 'BOOKING_REMINDER',
  'REVIEW_PROMPT', 'REVIEW_CREATED', 'REVIEW_REPLIED', 'SAVED_SEARCH_MATCH', 'MESSAGE_CREATED',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Settings switches (Figma I6). A kind outside every topic (moderation, expiry, reviews) is always delivered. */
export const NOTIFICATION_TOPICS = ['chat', 'booking', 'saved_search', 'news'] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export const notificationTopic = (kind: NotificationKind): NotificationTopic | null => {
  if (kind === 'MESSAGE_CREATED') return 'chat';
  if (kind === 'SAVED_SEARCH_MATCH') return 'saved_search';
  if (kind.startsWith('BOOKING_')) return 'booking';
  return null;
};

/** Facts copied at the event, so a row still reads right after the listing or booking changes. */
export interface NotificationData {
  post_id?: number | null;
  booking_id?: number | null;
  review_id?: number | null;
  provider_id?: string | null;
  saved_search_id?: string | null;
  conversation_id?: string | null;
  /** Listing title. */
  title?: string | null;
  /** The other person: customer, provider (company name first) or reviewer. */
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  reason?: string | null;
  field_key?: string | null;
  revision?: boolean;
  days_left?: number | null;
  rating?: number | null;
  /** SAVED_SEARCH_MATCH: new listings since the row was last read, and the search's name. */
  count?: number | null;
  query?: string | null;
  preview?: string | null;
  /** The recipient's side of a booking. */
  role?: DealRole | null;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  data: NotificationData;
  read_at: ISODate | null;
  created_at: ISODate;
}

/** `GET /notifications?before&before_id`, newest first. */
export const NOTIFICATIONS_PAGE = 30;
/** `PUT /notifications/read`: the given ids, or every unread one when `ids` is omitted. */
export interface NotificationsReadRequest { ids?: string[] }

/** `GET|PUT /notifications/settings`. `locale` picks the language of e-mail (push uses each device's own). */
export interface NotificationSettings {
  topics: Record<NotificationTopic, boolean>;
  locale: Locale | null;
  email: string | null;
}
export interface NotificationSettingsUpdate { topics?: Partial<Record<NotificationTopic, boolean>>; locale?: Locale }

export type PushProvider = 'EXPO' | 'WEB';
/** `POST /notifications/devices`. EXPO: `token` is the Expo push token. WEB: `token` is the subscription endpoint and `keys` its keys. */
export interface PushDeviceRequest {
  provider: PushProvider;
  token: string;
  keys?: { p256dh: string; auth: string };
  locale?: Locale;
  platform?: string;
}
/** `DELETE /notifications/devices` on sign-out. */
export interface PushDeviceRemoveRequest { token: string }
/** `GET /notifications/vapid-key`: null when web push is not configured. */
export interface VapidKeyResponse { key: string | null }

/** The `data` a push carries, for the tap handler. */
export interface PushPayload { notification_id: string | null; kind: NotificationKind; data: NotificationData }

// ---- Auth (sign-in by text via verify.mn) and profile ----

/** The signed-in account as the auth response carries it; `is_admin` is never stored. */
export interface AuthUser {
  id: string;
  phone_number: string;
  type: UserType | null;
  is_verified: boolean | null;
  is_admin: boolean;
}

export interface AuthResponse { user: AuthUser; token: string }

export type VerifyStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED';

/** `POST /auth/verify/start`. */
export interface VerifyStartRequest { phone_number: string; device_id?: string }
/** A trusted device gets `verified: true` and `auth`; otherwise the session fields to text in. */
export interface VerifyStartResponse {
  verified: boolean;
  session_id: string | null;
  /** The code to text to `shortcode`. Not a secret. */
  code: string | null;
  shortcode: string | null;
  sms_uri: string | null;
  expires_at: ISODate | null;
  auth: AuthResponse | null;
}

/** `POST /auth/verify/status`. */
export interface VerifyStatusRequest { session_id: string }
export interface VerifyStatusResponse { status: VerifyStatus; auth: AuthResponse | null }

/** `POST /auth/logout`. */
export interface LogoutRequest { device_id?: string }
export interface OkResponse { ok: true }

/** `POST /user/role`: set once; repeating the same role is a no-op, changing it is ROLE_ALREADY_SET. */
export interface SetRoleRequest { type: UserType }

/** `PATCH /user/profile`: `null` or `''` clears a field. */
export interface UpdateProfileRequest {
  given_name?: string | null;
  parent_name?: string | null;
  email?: string | null;
  address?: string | null;
}
