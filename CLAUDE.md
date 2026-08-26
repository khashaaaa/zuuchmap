# CLAUDE.md — Zuuchmap

Construction marketplace for Mongolia. Providers post rentals/services/jobs across 13 categories; admins approve posts before they go live; customers browse, filter, save, contact.

| Dir | Stack |
|---|---|
| `zuuchmap_engine/` | NestJS 11, TypeORM, PostgreSQL, Socket.io |
| `zuuchmap_web/` | React 19, Vite, Tailwind 4, Zustand, React Query |
| `zuuchmap_app/` | React Native 0.81, Expo 54 |

---

## Rules

- **No git commands.** User manages all commits.
- **No yarn.** Use `npm` everywhere.
- **Read targeted.** grep/find first, read only the needed range.
- **No speculative cleanup.** Only change what the task requires.
- **No bloatware.** Prefer editing existing files over creating new ones.
- **Bigger picture.** When fixing an issue, scan the whole codebase for the same pattern, report all locations, ask before acting.

---

## Cross-repo sync

These values are duplicated across the three apps by design. `npm run check:sync`
(`scripts/check-sync.js`, zero deps) verifies them and **gates deploy.sh as step
0/6** — run it after touching any of them. It reports **16 contracts** against the
14 rows below: the locations row covers `provinces` + `districts`, and the i18n
row covers `i18n:mn` + `i18n:en`.

| Contract | Copies |
|---|---|
| `SOCKET_EVENTS` | engine gateway · `web/lib/socket.js` · `app/services/socketService.js` |
| category fallback colours | `app/design/theme.js` · `web/lib/utils.js` · engine `category.service.ts` seed |
| palette | `app/design/theme.js` · `web/src/index.css` (1:1 tokens only — the file names the deliberate exceptions) |
| `Province` / `District` | engine `enums/province.ts` · `app/config/app.config.js` · `web/lib/utils.js` |
| `PriceUnit` | engine `enums/priceunit.ts` · `web/lib/utils.js` · `app/config/app.config.js` |
| shared i18n keys | `app/i18n/locales/{mn,en}.js` · `web/i18n/{mn,en}.js` — each tree keeps ~280 platform-specific keys, but a key present in **both** must have the same value |
| `getPostTitle` | `app/utils/postUtils.js` · `web/lib/utils.js` — checked *behaviourally*: both are lifted, stubbed and run over shared fixtures |
| `postHealth` | `app/utils/postHealth.js` · `web/lib/postHealth.js` — behavioural; the same listing must score the same on both |
| map clustering | `app/screens/customer/CustomerMapView.jsx` (`gridCluster`) · `web/lib/mapCluster.js` — behavioural, across four zoom levels |
| `formatPrice` | `app/utils/displayUtils.js` · `web/lib/utils.js` — behavioural; mn-MN grouping, no decimal tail, and never a `/unit` suffix on `TOTAL` |
| `formatDate` | `app/utils/displayUtils.js` · `web/lib/utils.js` — behavioural; `YYYY.MM.DD` built by hand on both. **Neither side may use `Intl`** — RN's JSC has no full ICU on Android, so a locale-driven format silently falls back to en-US there |
| price unit labels | `app/i18n/locales/{mn,en}.js` (`priceUnit.HOUR`) · `web/i18n/{mn,en}.js` (`priceUnit.hour`) — the casing differs, so the shared-i18n contract above cannot see these; compared case-insensitively instead |
| typeface | `app/design/theme.js` (bundled Commissioner TTFs) · `web/src/index.css` (`@font-face`, self-hosted). **Never load it from Google Fonts** — that serves Commissioner as four `unicode-range` subsets, stranding Ө/Ү in `cyrillic-ext` and ₮ in `latin-ext`, so those glyphs render in the fallback face until a second request lands |
| form validation | `app/utils/formUtils.js` · `web/lib/utils.js` — `validateEmail` `validatePhone` `validateRequired` `normalizeWebsiteUrl`, behavioural. The company DTOs have no server-side decorators, so these are the only gate; no call site may hand-roll the `https://` prefix rule |

---

## Deployment

`.claude/skills/deploy/deploy.sh` — one-command production deploy (push → DB backup → engine pull/build/migrate/pm2 restart → web build → smoke test). Server facts and gotchas in `.claude/skills/deploy/SKILL.md`. Credentials in `~/.zuuchmap-deploy.env` (never committed).

`.claude/skills/deploy/restore-drill.sh` — restores the newest dump into a scratch
database, asserts the core tables came back with rows, drops it again. Production
is never touched. Run it monthly and after any change to the backup step: an
unverified dump is not a backup.

**Monitoring.** Point an uptime monitor at `https://zuuchmap.com/engine/health/ready`
and alert on non-200. pm2 restarting a crashed process is not monitoring — nothing
was watching for "up but not serving", which is the shape the 9-day 502 took.

**Nginx (manual, one time).** The generated sitemaps and the per-listing OG tags
must be served from the site's own origin — a sitemap on another host is ignored,
and a crawler reads OG tags from the URL that was shared. The `location` blocks
are in `.claude/skills/deploy/SKILL.md`; without them the SEO module is reachable
only under `/engine` and does nothing for search or link previews.

**App releases.** `expo-updates` is wired (`app.json` `updates`, EAS channels in
`eas.json`, `hooks/useOtaUpdates.js`), so a JavaScript-only fix ships with
`eas update` instead of a store review. `runtimeVersion` must change **only when
the native code does** — bumping it per release strands every installed build with
no compatible update. The hook fetches in the background and applies on the next
return from background, never mid-form.

---

## Commands

Monorepo — three independent apps (own `package.json`/`node_modules`/lockfile each, no npm workspaces). Root `package.json` just proxies into each:

```bash
npm run install:all   # installs all three
npm run dev:engine    # port 8282
npm run dev:web
npm run dev:app       # Expo

# equivalent, if working inside one app:
cd zuuchmap_engine && npm run dev
```

**Tests.** All three apps have a suite now, and `.github/workflows/ci.yml` runs
them on every push and PR (plus `check:sync` and a web build). Lint is
**advisory** in CI on purpose — both eslint configs carry findings that predate
the workflow, and a gate nobody can pass is a gate everybody learns to ignore.

```bash
cd zuuchmap_engine && npm test        # jest, mocked repositories
cd zuuchmap_engine && npm run test:int # real Postgres: schema + the HTTP journey
cd zuuchmap_web    && npm test        # vitest + Testing Library (jsdom)
cd zuuchmap_app    && npm test        # jest-expo + RNTL
```

`zuuchmap_engine/src/e2e/journey.int-spec.ts` walks the actual product over HTTP
— create → approve → view → message → report — minting JWTs directly from
`JWT_SECRET` rather than through verify.mn (that flow costs the user 150₮ per run
and proves possession of a phone, which is not what the suite is asking about).
It deletes everything it creates. **RNTL v14's `render` is async** — `await` it,
or the queries do not exist yet (`src/test/render.jsx` does this for you).

---

## Backend

**Entry:** `src/main.ts` — port `8282`, prefix `/engine`  
**Env:** `config/variables/<NODE_ENV>.env` — `PG_*` `JWT_SECRET` `ADMIN_PHONES` `R2_*` `PROG_PORT` `PUBLIC_ENGINE_URL`
- `ALLOWED_ORIGIN` — comma-separated browser origins. Gates **both** the HTTP CORS allowlist (`main.ts`) and the Socket.io one (`events.gateway.ts`). A request with no `Origin` (the app, curl, verify.mn's callback) is never affected. Add every host the web app is served from — a bare apex here blocks `www.`.
- `VERIFY_MN_API_KEY` `VERIFY_MN_BASE_URL` `VERIFY_MN_TIMEOUT_MS` (default 10s) — verify.mn client.
- `VERIFY_TTL_MS` (5m) how long a verification session lives · `VERIFY_RATE_LIMIT` (5) + `RATE_TTL_MS` (1h) per-phone cap on **paid** SMS verifications, 150₮ each. `OTP_RATE_LIMIT` is the retired name, still read as a fallback.
- `THROTTLER_TTL` (60s) / `THROTTLER_LIMIT` (100) — global per-IP default. Routes that need to be stingier set their own `@Throttle`: `auth/verify/start` and the legacy `user/check` are 3/min.
- `ANALYTICS_RETENTION_DAYS` — pruned nightly by `AnalyticsService`.
- `REDIS_URL` (or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`) — optional; see the multi-instance row under Known issues.
- `SENTRY_DSN` (+ `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`) — error reporting (`utils/observability.ts`). Unset ⇒ no-op; unhandled 5xx, uncaught exceptions and rejected promises stay in the pm2 log.
- `QPAY_USERNAME` `QPAY_PASSWORD` `QPAY_INVOICE_CODE` (+ `QPAY_BASE_URL`, `QPAY_TIMEOUT_MS`) — payments. Unset ⇒ `qpayConfigured()` is false and `/payments/invoice` answers 503 rather than half-working.
- `PLAN_PRICE_PROVIDER_MNT` — monthly price of the PROVIDER plan. **The built-in default is a placeholder**; set the real number before taking money.
- `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` — browser push (`utils/webPush.ts`). Generate once with `npx web-push generate-vapid-keys`; the public half is served by `GET /user/push/vapid-key` so the two sides cannot drift.
- `SMTP_HOST` (+ `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM`) — email (`utils/mailer.ts`). Only ever a payment receipt or a fallback for an account with no push device at all; signup is phone-based, so most accounts have no address and get nothing here.
- `PUBLIC_WEB_URL` (default `https://zuuchmap.com`) — the origin the sitemap and OG tags are built from.  
**DB:** `synchronize: false` — TypeORM migrations (`src/migrations/`, `data-source.ts`).  
**⚠ `migrationsRun: true`** — the dev server auto-runs any pending migration file on (re)start, including watch-mode restarts. Never leave a broken/experimental migration file on disk while `npm run dev` is running.  
**Uploads:** Cloudflare R2 via S3 client (`src/utils/uploader.ts`), magic-byte validation, Sharp compression.

**Modules:** `auth` `user` `post` `company` `likedpost` `admin` `events` `booking` `review` `analytics` `saved-search` `payment` `messaging` `report` `seo` `health`  
**Post module services:** `PostService` (posts, expiry cron, cache) · `CategoryService` (`post/category.service.ts` — schemas, validation, seeding; unit-tested in `category.service.spec.ts`, run `npx jest`) · `PostNotificationService` (`post/post-notification.service.ts` — push fan-out to admins/users; injected by `BookingService` too) · `ViewedpostService` (`post/viewedpost.service.ts` — view dedupe, no routes)  
**User module controllers:** `UserController` (self-service) + `UserAdminController` (`user-admin.controller.ts` — admin ops on other accounts). Both use the `user` prefix; **UserAdminController must stay last in the module's `controllers` array** or its `:id` routes shadow `/user/profile` and `/user/account`.

**Key endpoints:**
```
POST /auth/verify/start           {phone_number,device_id?} → trusted device returns a token
POST /auth/verify/status          {session_id} → PENDING|VERIFIED|EXPIRED (+token)
GET  /auth/verify/callback/:id    verify.mn nudge (unauthenticated, never trusted alone)
GET  /user/profile                JWT
GET  /posts                       ?category&subcategory&province&district&approval_status
                                  &q&attr.<key>[=|_min=|_max=]&page&limit
                                  → { items, total }   (all other list endpoints return arrays)
GET  /posts/mine                  JWT
GET  /posts/mine/stats            JWT   per-post views/saves/booking counts + totals
                                  `views` now counts anonymous visitors too: PUT /posts/:id/views is
                                  optional-auth and dedupes on `X-Visitor-Id` (salted+hashed server-side,
                                  `utils/visitor.ts`) when there is no session. Owners still never count
                                  their own views. Clients send the header from `web/lib/visitor.js` /
                                  the app's existing `getAnonId()`.
GET  /posts/:id/similar           ?limit  same category, nearest location/price (cached 5m)
                                  list/map/detail items carry busy_dates[] (next 14d) for has_rental_status categories
POST /posts                       multipart JWT
GET  /posts/stats                 public landing counters (cached 5m)
GET  /posts/categories/all
POST /like  DELETE /like/:type/:id  GET /like/ids
GET  /admin/posts/pending
POST /admin/broadcast             JWT+AdminGuard  {title,body,user_type?,category?} push campaign
PUT  /admin/posts/:id/approve|reject   JWT+AdminGuard   reject {reason,field_key?} → post.rejection_field;
                                  approve clears it + post.previous_snapshot (set when an APPROVED post is edited)
POST /bookings                    JWT   {post_id,start_date,end_date,message?}
GET  /bookings/mine|received      JWT
PUT  /bookings/:id/accept|decline|cancel  JWT
POST /reviews                     JWT   {provider_id,rating,comment?} (upsert)
GET  /reviews/provider/:id             → {average,count,reviews,own,stats:{avg_response_hours,completed_bookings,member_since,company_verified}}
POST /saved-searches  GET /saved-searches  DELETE /saved-searches/:id   JWT, max 10; matched on approve → push type 'saved_search'
                                  daily 01:00 cron pushes 'review_prompt' for finished ACCEPTED bookings (booking.review_prompted_at)
POST /analytics/collect                batched events, anonymous allowed
GET  /analytics/summary           JWT+AdminGuard  ?days=7|30|90

GET  /health                      liveness — touches nothing external, never 503s on a DB blip
GET  /health/ready                readiness — DB (+Redis when configured); 503 when degraded

GET  /payments/catalogue          public plan ladder + `enabled` (false ⇒ QPay unconfigured)
POST /payments/invoice            JWT   {plan:'PROVIDER',months?} → {payment_id,qr_text,qr_image,urls[]}
GET  /payments/:id/check          JWT   polls QPay server-to-server; settles + grants the plan
GET  /payments/mine               JWT   receipts
GET  /payments/callback/:id       QPay nudge — unauthenticated, never trusted alone (same rule as verify.mn)

GET  /conversations               JWT   inbox
GET  /conversations/unread-count  JWT
POST /conversations               JWT   {post_id, body?} → opens or returns the existing thread
GET  /conversations/:id/messages  JWT   ?before=<ISO> cursor
POST /conversations/:id/messages  JWT   {body}
PUT  /conversations/:id/read      JWT   idempotent

GET  /reports/reasons             JWT   closed list — clients must not hardcode it
POST /reports                     JWT   {post_id,reason,detail?}; duplicate returns the existing one
GET  /reports  GET /reports/count JWT+AdminGuard  ?status=OPEN|RESOLVED|DISMISSED
PUT  /reports/:id                 JWT+AdminGuard  {status,resolution?}

GET  /seo/sitemap.xml             sitemap index; -static and -posts-N pages beneath it
GET  /seo/post/:id                server-rendered OG tags for crawlers (nginx routes bot UAs here)
```

**Bookings/reviews rules (enforced server-side):** only `has_rental_status` categories are bookable; no self-booking; one PENDING request per customer per post; accept refuses date overlap with an ACCEPTED booking; contact phone shared only after ACCEPTED; reviews require ≥1 ACCEPTED booking with the provider, one per author (upsert).

**Category system (data-driven — never hardcode category behavior in clients):**
- `CategorySchema` holds fields (`FieldDef[]`), subcategories, behavior flags
  (`has_rental_status` `has_availability_dates` `has_price` `default_price_unit`
  `emphasized` — attention-drawing card style in lists — and `post_expiry_days`,
  1–365, null = 30-day default applied at post creation),
  and localized `labels` (`{mn,en,zh,ru}`) on category/subcategory/field level.
- Clients derive form sections, status toggles, filter lists, map markers, badges and labels from the schema — `icon` is an Ionicons name, `color` a hex, both admin-editable. Adding a vertical is an admin-UI operation: no deploy, no app release. Do not reintroduce a hardcoded category list anywhere.
- `FieldDef.filterable` exposes an attribute as a browse filter (`attr.<key>` query param).
- `q` is Postgres full-text (prefix-matching tsvector over title+details). Both the browse query and the saved-search matcher tokenize through `utils/search-terms.ts` — the matcher has to answer the same question in JS, and when it had its own rule (whole-phrase `includes` on the title) a multi-word saved search matched in browse and never notified. Change the two together, or better, only change the shared helper.
- Post has `category` + `subcategory` only; legacy `secondcategory` still accepted as DTO input alias.

**Phone verification (verify.mn, Mobile-Originated):** we never send an SMS. `verify/start` registers a code; the *user* texts it to shortcode `144773` from the number they claim, and possession is proven by the message arriving from that number — so the code is not a secret and is rendered in the UI. Costs the end user 150₮ per verification, so it runs only at signup and on a new device: `TrustedDevice` stores `sha256(device_id)` and a match short-circuits to a token. The token is then held in AsyncStorage, unencrypted and behind no device-side unlock — `expo-local-authentication` was a declared-but-never-imported dependency, dropped in the dead-code sweep, so there is no biometric gate. The server never accepts a biometric claim: `user.biometric` and the OTP endpoint that trusted it are both gone.

**Realtime:** `events/events.gateway.ts` — Socket.io rooms `admin` + `user:<id>`. `MESSAGE_CREATED` goes to the recipient only (echoing to the sender races their optimistic row); `REPORT_CREATED` is admin-only. (legacy `provider:<id>` joins/emits kept for pre-rename app builds; drop when those are gone). Event names + payload shapes (`{postId, category, …}`) are exported as `SOCKET_EVENTS` and mirrored in `zuuchmap_web/src/lib/socket.js` and `zuuchmap_app/src/services/socketService.js` — change all three together. In the app, only `useNotificationSync` subscribes to the socket; screens never do.

**Notification transports:** `PostNotificationService` fans out over three, each env-gated and independently absent — Expo push (app), **web push over VAPID** (browsers, stored in the same `push_device` table with `provider='WEB'` and the subscription endpoint as `token`), and **email**, only for an account with no registered device at all. `splitTargets()` routes each row to the transport it speaks; a row that lacks what its transport needs is not counted as addressed.

**Admin guard:** `src/admin/admin.guard.ts` — reads `ADMIN_PHONES` env, exports `isAdmin()`.  
Web/app read `is_admin` from JWT response — they do not duplicate the list.

**Entities:** User · Post · Company · Likedpost · Viewedpost · CategorySchema · Booking · Review · VerificationSession · TrustedDevice · AnalyticsEvent · PushDevice · SavedSearch · Payment · Conversation · Message · Report  
**Enums:** `UserType` `ApprovalStatus` `Status` `PriceUnit` `Province` `District` `BookingStatus` `Plan` `PaymentProvider` `PaymentStatus` `ReportStatus` (+ `REPORT_REASONS`)

---

## Web (`zuuchmap_web/`)

**Entry:** `src/main.jsx` → `App.jsx`. Alias `@` → `src/`.  
**HTTP:** `src/lib/api.js` — Axios, auto-JWT, redirects `/login` on 401.  
**State:** `useAuthStore` + `useThemeStore` + `useNotificationStore` (Zustand, `src/store.js`); everything else React Query.  
**Realtime:** `hooks/useRealtimeSync.js` — Socket.io (JWT auth), invalidates queries on events.  
**i18n:** `src/i18n/` — `mn en`. (zh/ru retired; engine `labels` still carry them, so restoring is a client-side change only.)

**Key utilities** (`src/lib/utils.js`): `getPostCategory(post)`; `getCategoryLabel` / `getSubcategoryLabel` / `getFieldLabel` — resolve schema `labels[locale]` first, then client i18n, then raw label. Always use these for category-related display text.

**Routes:**
```
Public:   / (landing) /browse /login /verify /onboarding /posts/:id
Shared:   /privacy /terms (both `PolicyPage doc=`) /help /account-deletion
Authed:   /notifications /messages /messages/:id   (a thread has a customer AND a
          provider, so messaging belongs to neither role's routes)
Admin:    /admin /admin/posts /admin/posts/:id /admin/users /admin/users/:id
          /admin/categories /admin/analytics /admin/reports /admin/profile
Provider: /provider /provider/posts /provider/posts/new /provider/posts/:id
          /provider/posts/:id/edit /provider/profile /provider/company /provider/bookings
          /provider/billing
Customer: /customer /customer/browse /customer/map /customer/saved /customer/profile
          /customer/bookings
```

---

## App (`zuuchmap_app/`)

**Entry:** `App.js` → `Stack.Navigator`. Initial route: `src/utils/navigationUtils.js → getInitialRoute()`.

**Key configs:**
- `src/config/api.config.js` — `API_BASE_URL`, `ENDPOINTS`, `STORAGE_KEYS`
- `src/config/app.config.js` — `IMAGE`, `VALIDATION`, `provinces`/`districts` (bare code arrays; labels come from i18n `province.<CODE>`/`district.<CODE>`, mirrored in `zuuchmap_web/src/lib/utils.js`)
- `src/design/theme.js` — `palettes.dark/light` (Direction A: neutral grounds, amber accents), spacing, radius, typography; tablet scaling via `isTablet`. **No static `colors`/`globalStyles` exports** — get `{ colors, styles }` from `useAppTheme()`; per-file color styles use `themedStyles((colors) => ({...}))`. Text on amber fills uses `colors.onPrimary`; on semantic fills `colors.text.onColor`; on photography `colors.text.onMedia` (white in both palettes by design). **Never use `colors.primary` as a foreground** — it is a fill colour and only makes 2.3–2.6:1 on the light grounds. Amber *text* (prices, links, active labels) is `colors.text.link`; amber *glyphs* (icons, spinners) are `colors.iconAccent`. Both are amber in dark and step darker in light. Web's equivalent is `--color-primary-text`, used for accent text and icons alike (lucide glyphs inherit `currentColor`). Web mirrors the same values in `zuuchmap_web/src/index.css` — change palettes in both places.
  - **Type scale.** Spread a role — `...typography.styles.title` — never set `fontSize`+`fontFamily` by hand, so line-height and tracking travel with the size. Roles: `display h1 h2 h3 title body bodyBold bodyMedium lead label labelStrong caption small micro badge price overline`. `title` (18) is the card/row heading that does the scanning work in a list; `price` is its own rung; `overline` is for text set in caps.
  - **Elevation.** `...colors.elevation.sm|md|lg` — spread it FIRST in a style object so anything declaring its own `borderColor` after it wins. One idiom per theme, never both: dark separates with a hairline (black shadows are invisible on a dark ground), light separates with a soft shadow. `lg` keeps a shadow on both — modals sit over a scrim. `elevation.selected` is the amber selected state. Do not reintroduce raw `shadows.*` at a call site.
  - **Category colours.** `categoryColors` holds the eight fallbacks; the live value is admin-editable `CategorySchema.color`. All are solved to one luminance so a single stored hex reads at 4.0:1 on *both* grounds and ~2:1 against amber — amber therefore always stays the brightest accent. Anything rendering a category colour as *text* must pass it through `toneForTheme(hex, isDark)` first (admins can save any hex); `withAlpha(hex, a)` builds the tinted fill. Mirrored in `zuuchmap_web/src/lib/utils.js` and seeded in `post/category.service.ts` — change all three together.
  - **Motion.** `animations.duration/press/stagger`. Card and button presses use `<PressableScale>` (spring scale, honours reduce-motion) rather than `activeOpacity` alone; list entrances use `<FadeSlideIn index={i}>`; screen transitions are set in `App.js` `screenOptions`.

**Server state:** TanStack React Query everywhere — client from `src/services/queryClient.js` (wired in `App.js` with AppState focus manager). After any post mutation or socket event call `invalidatePostData()` from that module; it clears both React Query caches and the AsyncStorage offline fallbacks. `utils/cacheManager.js` is only the offline-fallback layer used inside services (map posts, category schemas) — never cache screen data with it.

**Seeded post types:** `vehiclerent toolrent machineryrent materialstore factory construction jobvacancy sos usedequipment transport designservice miningsupport winterservice` — but categories come from the API (`CategorySchema`); form behavior is driven by schema flags via `formUtils.getInitialFormData/getEditFormData(schema, …)`, and labels via `postUtils.getSchemaLabel/getSubcategoryLabel`.

**Category schemas:** `hooks/useCategorySchemas.js` → `useCategorySchemas()` / `useActiveCategorySchemas()`. Use these for any per-category affordance; `getPostTypeConfig(type, colors, schemas)` resolves icon+colour from the schema.

**New surfaces:** `screens/shared/MessagesScreen.jsx` + `MessageThreadScreen.jsx` (inbox and thread; routes `Messages` / `MessageThread`), `screens/provider/BillingScreen.jsx` (route `Billing` — QPay QR, bank deep links, receipts). Services: `messageService` `paymentService` `reportService`. Reporting is a reason sheet on `PostDetailScreen` rather than a screen — the reasons come from `REPORT_REASONS`, mirrored from the engine's enum.

**Admin detection:** `is_admin` from `userService.isAuthenticated()` — phone-based, not `userType`.  
**LikeButton:** every call site gates admins itself (`!isProvider && !isAdmin`, `showLike={isCustomer}`, or a customer-only screen). The component's own `hidden` fallback lives in `initializeLikeData()`, which is skipped whenever `skip_check` and `is_authenticated` are both passed — i.e. in every list. Do not rely on it.  
**⚠ BottomSheetModal:** `PanResponder` captures closures at mount — `onClose` is mirrored into a ref; keep that pattern when editing.

**i18n:** `src/i18n/locales/` — `mn en`. (zh/ru retired; see web note.)

---

## Known issues

| Priority | Issue | Location |
|---|---|---|
| 🟡 | Google Maps key ships in `app.json` (unavoidable for the Maps SDK); it must be restricted by package name + SHA-1 in Google Cloud Console — the app id is now `com.khashaa.zuuchmap` (Android package + iOS bundle, set 2026-08; do not change after store release) | `zuuchmap_app/app.json` |
| 🟡 | Prod Postgres SSL uses `rejectUnauthorized: false` (no CA validation) | `app.module.ts:50` |
| 🟢 | Multi-instance is Redis-gated. With `REDIS_URL` set: throttler storage → Redis (`@nest-lab/throttler-storage-redis`), cache invalidation → Redis pub/sub (`utils/cache-coordinator.ts`, per-process L1 + cross-instance clear), Socket.io → Redis adapter (`utils/redis-io.adapter.ts`). Then raise `PM2_INSTANCES`. **Unset `REDIS_URL` ⇒ single instance only** — each worker would otherwise split rate limits/cache/broadcasts. Localhost dev runs Redis-free (in-memory). | `utils/redis.ts`, `app.module.ts`, `ecosystem.config.js` |
| 🟡 | Web admin role is client-side routing only — backend endpoints are guarded, but the UI trusts `is_admin` from the JWT response | `web/src/App.jsx` |
| 🔴 | `PLAN_PRICE_PROVIDER_MNT` has a **placeholder default** (49,900₮). Set the real price before QPay credentials go in, or the first invoice charges a number nobody chose | `engine/payment/payment.service.ts` |
| 🟡 | The SEO routes do nothing until the nginx `location` blocks are added by hand (see the deploy skill). Until then the live sitemap is still the 5-URL static file and shared listings still show the generic card | `nginx-zuuchmap.conf` |
| 🟡 | `@sentry/react-native` and `expo-updates` are native modules — the installed build has neither until the next **EAS rebuild**. Error reporting and OTA both start working only from that build onward | `app/app.json` |
| 🟢 | Anonymous view dedupe falls back to a hashed IP+user-agent when a client sends no `X-Visitor-Id`. Under CGNAT that undercounts — deliberately the safe direction, but it is not exact | `engine/utils/visitor.ts` |
| 🟢 | Both eslint configs carry pre-existing findings (~1,460 engine, ~23 web), so lint is advisory in CI. `npm run lint` in the engine **fixes in place** — use `npx eslint src --no-fix` to look without rewriting 147 files | `.github/workflows/ci.yml` |
