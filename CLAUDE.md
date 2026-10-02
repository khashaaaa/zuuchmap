# CLAUDE.md — Zuuchmap

Construction marketplace for Mongolia. Providers post rentals/services/jobs across 13 categories; admins approve posts before they go live; customers browse, filter, save, contact.

| Dir | Stack |
|---|---|
| `zuuchmap_engine/` | NestJS 11, TypeORM, PostgreSQL, Socket.io |
| `zuuchmap_web/` | React 19, Vite, Tailwind 4, Zustand, React Query |
| `zuuchmap_app/` | React Native 0.81, Expo 54 |

## Rules

- **Git.** `git add -A`, commit, push. Nothing else.
- **No yarn.** Use `npm` everywhere.
- **Read targeted.** grep/find first, read only the needed range.
- **No speculative cleanup.** Only change what the task requires.
- **No bloatware.** Prefer editing existing files over creating new ones.
- **Bigger picture.** When fixing an issue, scan the whole codebase for the same pattern, report all locations, ask before acting.

## Commands

Three independent apps (own `package.json`/`node_modules`/lockfile, no workspaces). The root `package.json` proxies:

```bash
npm run install:all
npm run dev:engine    # port 8282
npm run dev:web       # port 5173
npm run dev:app       # Expo
npm run check:sync    # cross-repo contracts
```

**There are no test suites** (removed 2026-09-30). The gates, all run by `.github/workflows/ci.yml` on every push:

```bash
npm run check:sync                                  # 26 contracts, many behavioural
cd zuuchmap_engine && npx tsc --noEmit              # + migration:run against real Postgres, + build
cd zuuchmap_web && npm run lint:undef && npm run build
cd zuuchmap_app && npm run lint:undef && npx expo export --platform android   # resolves every import
```

Lint is **advisory** in CI (2,111 engine / 39 web pre-existing findings). `lint:undef` (web and app) is the exception: a name used and never imported builds fine — Metro included — and white-screens the page. `npm run lint` in the engine **fixes in place** — use `npx eslint src --no-fix` to look. The app's eslint config enforces only that rule and duplicate keys.

## Cross-repo sync

Values duplicated across the apps by design. `npm run check:sync` (`scripts/check-sync.js`, zero deps) verifies them and **gates `deploy.sh` as step 0/6** — run it after touching any of them. "Behavioural" = both copies are lifted and run over shared fixtures.

The app ships locales `mn en zh ru`, the web only `mn en`. Cross-client contracts compare `SHARED_LOCALES` (the overlap); completeness runs per client over `CLIENT_LOCALES`. Adding a locale means editing those two constants at the top of `check-sync.js`.

| Contract | Copies |
|---|---|
| `SOCKET_EVENTS` | engine gateway · `web/lib/socket.js` · `app/services/socketService.js` |
| category fallback colours | `app/design/theme.js` · `web/lib/utils.js` · engine `category.service.ts` seed |
| palette | `app/design/theme.js` · `web/src/index.css` (1:1 tokens only; the file names the exceptions) |
| `Province` / `District` | engine `enums/province.ts` · `app/config/app.config.js` · `web/lib/utils.js` |
| `PriceUnit` | engine `enums/priceunit.ts` · `web/lib/utils.js` · `app/config/app.config.js` |
| `REPORT_REASONS` | engine `enums/report.ts` (authority, `GET /reports/reasons`) · `web/lib/api.js` · `app/services/api/reportService.js` (first-paint fallback only) |
| i18n | `app/i18n/locales/*.js` · `web/i18n/*.js` — a key present in both trees must have the same value; every locale has `en`'s key set on its own side; every literal `t('…')` resolves; every `PriceUnit` code has a `priceUnit.<CODE>` label in every locale |
| thumbnail naming | engine `utils/uploader.ts` `thumbUrl` · web `getThumbUrl` · app `getPostThumbUrl` — `<name>.jpg` → `<name>_thumb.jpg`; every call site falls back to the full-size URL |
| typeface | `app/design/theme.js` (bundled Commissioner TTFs) · `web/src/index.css` (self-hosted `@font-face`). **Never Google Fonts** — its `unicode-range` subsets strand Ө/Ү/₮ in the fallback face |
| behavioural, `app/utils/displayUtils.js` · `web/lib/utils.js` | `formatPrice` `formatPriceParts` (a `TOTAL` price has no unit) · `formatDate` (`YYYY.MM.DD`) · `formatTime` (`HH:MM` 24h) · `formatDateTime` · `formatRelativeAge` · `formatInboxStamp` (time today, date if older) · `formatNotificationStamp` |
| behavioural, other | `getPostTitle` (`app/utils/postUtils.js` · `web/lib/utils.js`) · `postHealth` (`app/utils/postHealth.js` · `web/lib/postHealth.js`) · map clustering (`CustomerMapView.jsx` `gridCluster` · `web/lib/mapCluster.js`) · form validation (`app/utils/formUtils.js` · `web/lib/utils.js`: `validateEmail` `validatePhone` `validateRequired` `normalizeWebsiteUrl` — the company DTO bounds lengths and checks the email, but phone and website formats are checked only here) |
| `Intl ban` | no file outside `app/utils/displayUtils.js` and `web/lib/utils.js` may name `toLocaleString` `toLocaleDateString` `toLocaleTimeString` `localeCompare` or `Intl.*`. RN's JSC has no full ICU on Android, so a locale call silently resolves to en-US there while Node's full ICU makes the checker agree. Number grouping is hand-rolled (`groupThousands`) |

### Web/app parity

1. **Identical — the same fact rendered twice.** A price, date, time, phone, status label, category name, count. Put it in a shared-named helper on both sides with a `check:sync` contract.
2. **Equally available — anything done in a transaction.** Browse, save, message, report, book, renew, pay, review, saved searches. Guest affordances count: a named sign-in prompt on one client means one on the other.
3. **Free to differ — how a capability is reached.** Navigation shape, density, input modality, platform transports.

**Admin is deliberately not at parity.** The app carries the queues (approval, reports); the web carries configuration and look-ups (category schemas, user detail, company verification, broadcast, featured grants).

## Deployment

`.claude/skills/deploy/deploy.sh` — push → DB backup → engine pull/build/migrate/pm2 restart → web build → smoke test. Every remote step runs under `pipefail` and the smoke test exits non-zero, so a failed build or migration stops the deploy. The web is built into `dist.next` and copied over `dist` without deleting, so the previous release's chunks survive for tabs still open. Server facts, the manual nginx blocks, monitoring and the restore drill are in `.claude/skills/deploy/SKILL.md`. Credentials in `~/.zuuchmap-deploy.env`.

**App releases.** `expo-updates` is wired, so a JS-only fix ships with `eas update`. `runtimeVersion` is a bare native-ABI counter (`"1"`) and changes **only when native code does** — bumping it per release strands every installed build.

## Backend

**Entry:** `src/main.ts` — port `8282`, prefix `/engine`.
**Env:** `config/variables/<NODE_ENV>.env` (gitignored), loaded by `utils/load-env.ts` — **which must stay the first import in `main.ts`**: `ConfigModule` reads the file too late for anything evaluated at module scope or in a decorator. **`.env.example` in the engine and the web list every variable the code reads — add a variable there in the same commit that reads it.**
**DB:** `synchronize: false`, TypeORM migrations (`src/migrations/`, `data-source.ts`). ⚠ **`migrationsRun: true`** — the dev server runs any pending migration on every (re)start. Never leave a broken migration on disk while `npm run dev` is running.
**Uploads:** Cloudflare R2 (`src/utils/uploader.ts`), magic-byte validation, Sharp. Each post photo is stored as a 1920×1080 original plus a 640px `_thumb`; lists request the thumb. Older photos need `npm run backfill:thumbs`.

Required env: `PG_*` `JWT_SECRET` `ADMIN_PHONES` `R2_*` `PROG_PORT` `PUBLIC_ENGINE_URL`. Optional, each inert when unset:

- `ALLOWED_ORIGIN` — comma-separated; gates HTTP CORS and the socket's polling preflight. List every host (a bare apex blocks `www.`). A websocket upgrade is not origin-checked — both clients connect websocket-only and the handshake JWT is the gate.
- `VERIFY_MN_API_KEY` `VERIFY_MN_BASE_URL` `VERIFY_MN_TIMEOUT_MS` · `VERIFY_TTL_MS` (5m) · `VERIFY_RATE_LIMIT` (5) + `RATE_TTL_MS` (1h) per phone.
- `THROTTLER_TTL` / `THROTTLER_LIMIT` — global per-IP default; `auth/verify/start` is 3/min.
- `ANALYTICS_RETENTION_DAYS` · `VIEW_KEY_SALT` (set to the current `JWT_SECRET` before rotating it) · `SENTRY_DSN` · `REDIS_URL` (required for more than one pm2 instance) · `SMTP_*` · `PUBLIC_WEB_URL`.
- `QPAY_USERNAME` `QPAY_PASSWORD` `QPAY_INVOICE_CODE` — unset ⇒ `/payments/invoice` answers 503.
- `PLAN_PRICE_PROVIDER_MNT` — **default is a placeholder**. `FEATURED_PRICE_PER_DAY_MNT` — **no default**; unset ⇒ placement is not for sale.
- `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` — browser push; the public half is served by `GET /user/push/vapid-key`.

**Modules:** `auth` `user` `post` `company` `likedpost` `admin` `events` `booking` `review` `analytics` `saved-search` `payment` `messaging` `report` `seo` `health`
**Post services:** `PostService` · `CategoryService` (schemas, validation, seeding) · `PostNotificationService` (push fan-out) · `ViewedpostService`.
**User controllers:** `UserController` + `UserAdminController`, both on the `user` prefix. **`UserAdminController` must stay last in `controllers`** or its `:id` routes shadow `/user/profile`.
**Admin guard:** `src/admin/admin.guard.ts` reads `ADMIN_PHONES`. Clients read `is_admin` from the auth response; they never duplicate the list.
**Entities:** User · Post · Company · Likedpost · Viewedpost · CategorySchema · Booking · Review · VerificationSession · TrustedDevice · AnalyticsEvent · PushDevice · SavedSearch · Payment · Conversation · Message · Report

### Endpoints

```
POST /auth/verify/start           {phone_number,device_id?} → trusted device returns a token
POST /auth/verify/status          {session_id} → PENDING|VERIFIED|EXPIRED (+token)
GET  /auth/verify/callback/:id    verify.mn nudge — unauthenticated, never trusted alone
POST /auth/logout                 JWT {device_id} — forgets that trusted device (web sign-out only)
GET  /user/profile                JWT
GET  /posts                       ?category&subcategory&province&district&approval_status
                                  &q&attr.<key>[=|_min=|_max=]&page&limit → { items, total }
                                  (every other list endpoint returns an array)
GET  /posts/mine                  JWT
GET  /posts/mine/stats            JWT   per-post views/saves/bookings + totals
GET  /posts/:id                   the only route that returns `details`; carries `like_count`
GET  /posts/:id/similar           ?limit (cached 5m)
PUT  /posts/:id/views             optional auth; anonymous dedupe on X-Visitor-Id
POST /posts                       multipart JWT
PATCH /posts/:id                  multipart JWT — see "Editing a live post"
POST /posts/:id/renew             JWT   reopens a lapsed window, no moderation, quota-checked
GET  /posts/stats                 landing counters (cached 5m)
GET  /posts/categories/all
POST /like  DELETE /like/:type/:id  GET /like (?page&limit)  GET /like/ids   JWT
GET  /admin/posts/pending         AdminGuard  PENDING or pending_revision set, FIFO
PUT  /admin/posts/:id/approve|reject   AdminGuard  reject {reason,field_key?}
POST /admin/broadcast             AdminGuard  {title,body,user_type?,category?}
POST /bookings  GET /bookings/mine|received  PUT /bookings/:id/accept|decline|cancel   JWT
POST /reviews                     JWT   {provider_id,rating,comment?} (upsert)
GET  /reviews/provider/:id        → {average,count,reviews,own,stats}
POST|GET /saved-searches  DELETE /saved-searches/:id   JWT, max 10
POST /analytics/collect           batched, anonymous allowed
GET  /analytics/summary           AdminGuard  ?days=7|30|90
GET  /health                      liveness
GET  /health/ready                readiness — 503 when DB/Redis is down
GET  /payments/catalogue          plan ladder + featured{enabled,price_per_day,…}
POST /payments/invoice            JWT   {kind:'PLAN',plan,months?} | {kind:'FEATURED',post_id,days?}
                                  (`kind` defaults to PLAN)
GET  /payments/:id/check          JWT   polls QPay, settles, grants
GET  /payments/mine               JWT
GET  /payments/callback/:id       QPay nudge — unauthenticated, never trusted alone
GET  /conversations               JWT   50/page, ?before=<ISO>
GET  /conversations/unread-count  JWT
POST /conversations               JWT   {post_id, body?} → opens or returns the thread
GET  /conversations/:id/messages  JWT   ?before&before_id, 30/page
POST /conversations/:id/messages  JWT   {body}
PUT  /conversations/:id/read      JWT
GET  /reports/reasons             JWT
POST /reports                     JWT   {post_id,reason,detail?}; a duplicate returns the existing one
GET  /reports  GET /reports/count AdminGuard
PUT  /reports/:id                 AdminGuard  {status,resolution?} — OPEN only
GET  /seo/sitemap.xml  GET /seo/post/:id   sitemap index; OG tags for crawlers
```

- **List items go through `listItem`** (`utils/public-user.ts`): no `details`, no moderation fields (`pending_revision` `previous_snapshot` `rejection_reason` `rejection_field`). Same on `/similar` and `GET /like`. Items carry `busy_dates[]` (14d) for `has_rental_status` categories.
- **Likes key on `post_id` alone.** `:type` in the URL is accepted and ignored; `likedpost.post_type` is a denormalised copy of `post.category`, written from the post on insert.
- **Views** (`viewedpost.service.ts` `countView`): one per viewer per post, ever; only live (approved, unexpired) posts; never the owner or an admin — their row is recorded uncounted so the same device signed out stays uncounted. Clients send `X-Visitor-Id` (`web/lib/visitor.js`, the app's `getAnonId()`), also on signed-in rows; without it the engine falls back to hashed IP+UA. Anonymous viewers are capped at 30 per address per post per day (`ip_key`). Keys are salted with `VIEW_KEY_SALT`, falling back to `JWT_SECRET`.

### Behaviour

**Bookings / reviews.** A booking outlives its post (`booking.post` is nullable, `ON DELETE SET NULL`): it can still be declined or cancelled, never accepted. Only `has_rental_status` categories are bookable; no self-booking; one PENDING request per customer per post; accept refuses overlap with an ACCEPTED booking; the contact phone is shared only after ACCEPTED. Review eligibility (`ReviewService.canReview`) is an ACCEPTED booking **or** a conversation the provider replied to — four categories have no booking flow at all.

**Editing a live post (`pending_revision`).** An APPROVED post never leaves browse because its owner edited it: the proposal is parked in `post.pending_revision`, approve writes it onto the row, reject drops it, and `approval_status` stays APPROVED throughout. A PENDING or REJECTED post is edited in place. Consequences: the owner's form hydrates from `pending_revision ?? post`; revision photos are referenced only by the revision, so reclaim must cover both sets; `rejection_reason` on an APPROVED post means *the edit* was refused. `PostService.isProvenProvider` (3+ approved, zero rejections, zero upheld reports) auto-publishes edits — never new listings.

**Expiry.** 00:00 `expireOldPosts` marks lapsed posts EXPIRED and pushes `post_expired`; 01:00 `warnExpiringPosts` pushes `post_expiring` once, on the night a post is three days out, and `review_prompt` for finished bookings. Crons that push or settle call `claimCron()` (`utils/redis.ts`) so only one pm2 worker runs them.

**Category system — data-driven; never hardcode category behaviour in a client.**
- `CategorySchema` holds `FieldDef[]`, subcategories, flags (`has_rental_status` `has_availability_dates` `has_price` `default_price_unit` `emphasized` `post_expiry_days`), `icon` (Ionicons name), `color` (hex) and localized `labels` `{mn,en,zh,ru}` at category/subcategory/field level. All admin-editable: adding a vertical needs no deploy.
- `FieldDef.filterable` exposes an attribute as a browse filter (`attr.<key>`).
- `q` is Postgres full-text over title + details + location + address + attribute *values* (keys and true/false/null are stripped — indexed, "man" matched every `manufacturer` post), prefix-matching. Browse and the saved-search matcher both tokenize through `utils/search-terms.ts` — change only the shared helper. **Query terms are stemmed (`stripMongolianSuffix`), documents are not**; non-Cyrillic terms stay literal.
- Post has `category` + `subcategory`; legacy `secondcategory` is still accepted as a DTO alias.

**Phone verification (verify.mn, Mobile-Originated).** We never send an SMS: the *user* texts a displayed code to `144773` from the number they claim, at 150₮ per verification. It runs only at signup and on a new device — `TrustedDevice` stores `sha256(device_id)` and a match returns a token directly. Web sign-out forgets the browser (shared computers); app sign-out keeps the phone trusted. A session is spent by one conditional `UPDATE`, and `user.phone_number` is unique — never reintroduce a read-then-write on either. Sessions last `SESSION_EXPIRES_IN` (`utils/session.ts`, one year) because signing in again costs the user money.

**Roles are server-enforced.** `user.type` is set once (`POST /user/type` answers 409 `ROLE_ALREADY_SET` on a change; the profile DTO has no `type`). Post, company and plan-invoice creation call `assertProvider` (`enums/usertype.ts`; admins pass) — the clients only hide those actions.

**`req.user` is identity only.** `JwtStrategy.validate` answers from `sessionUsers` (30s) and loads no relations. Handlers read `id` and `phone_number` off it and nothing else; anything mutable is read by the service that needs it. Account deletion calls `forgetSessionUser`.

**Push permission is never requested at login.** `useNotificationSync` only registers an already-granted token; `utils/pushPrompt.js` asks later behind an in-app rationale. `UnreachableBanner` (both clients) tells a provider who declined.

**Realtime.** `events/events.gateway.ts` — rooms `admin` + `user:<id>` (legacy `provider:<id>` kept for old builds). `MESSAGE_CREATED` goes to the recipient only and carries the whole message; `REPORT_CREATED` is admin-only. In the app only `useNotificationSync` subscribes to the socket.

**Notification transports.** `PostNotificationService` fans out over Expo push, web push (VAPID, stored in `push_device` with `provider='WEB'`) and email (only for an account with no device). `splitTargets()` routes each row. Copy lives in `utils/push-messages.ts` in all four app locales and is resolved per device from `push_device.locale`, which the client sends with its token; null reads as `mn`. Admin pushes and broadcasts are not localised.

## Web (`zuuchmap_web/`)

**Entry:** `src/main.jsx` → `App.jsx`. Alias `@` → `src/`.
**HTTP:** `src/lib/api.js` — Axios, auto-JWT, redirects to `/login` on 401.
**State:** `useAuthStore` `useThemeStore` `useNotificationStore` (Zustand, `src/store.js`); everything else React Query. `hooks/useRealtimeSync.js` invalidates queries on socket events.
**i18n:** `src/i18n/` — `mn en`, listed in `LANGUAGES`. A new string goes in both files.

⚠ **`AdminCategories` label inputs derive from `SCHEMA_LOCALES`, not `LANGUAGES`.** The app renders all four locales and the web admin is the only place to edit them.

**Category display text** always goes through `getCategoryLabel` / `getSubcategoryLabel` / `getFieldLabel` (`src/lib/utils.js`): schema `labels[locale]`, then client i18n, then the raw label. Page titles come from `meta.title` / `meta.description` via `useDocumentMeta`.

```
Public:   / /browse /login /verify /onboarding /posts/:id /privacy /terms /help /account-deletion
Authed:   /notifications /messages /messages/:id
Admin:    /admin /admin/posts[/:id] /admin/users[/:id] /admin/categories /admin/analytics
          /admin/reports /admin/profile
Provider: /provider /provider/posts[/new|/:id|/:id/edit] /provider/profile /provider/company
          /provider/bookings /provider/billing
Customer: /customer /customer/browse /customer/map /customer/saved /customer/saved-searches
          /customer/profile /customer/bookings
```

## App (`zuuchmap_app/`)

**Entry:** `App.js` → `Stack.Navigator`; initial route from `getInitialRoute()` in `App.js`.

**Startup never waits on the network.** A stored token and role open the app at once; `userService.isAuthenticated()` runs behind it and treats only a 401 as signed out. The token is memoised in `authHelpers` (`rememberAuthToken`) — code that removes the storage key must call it.

**Guest mode.** An unauthenticated launch lands on `CustomerDashboard`. Reading is open; save, message, report and book call `ensureAuth(navigation, reasonKey)` (`src/utils/requireAuth.js`). `useIsGuest()` returns `null` until the token read resolves.

**Config:** `src/config/api.config.js` (`API_BASE_URL`, `ENDPOINTS`, `STORAGE_KEYS`; overridable with `EXPO_PUBLIC_API_BASE_URL` — Expo inlines only `EXPO_PUBLIC_*`, and Sentry likewise reads `EXPO_PUBLIC_SENTRY_DSN`) · `src/config/app.config.js` (`IMAGE`, `VALIDATION`, `provinces`/`districts` as bare codes; labels from i18n).

**Theme (`src/design/theme.js`).** No static `colors`/`globalStyles` exports — get `{ colors, styles }` from `useAppTheme()`; per-file styles use `themedStyles((colors) => ({...}))`. The web mirrors the palette in `src/index.css`.
- **Amber.** `colors.primary` is a fill, **never a foreground**. Amber text is `colors.text.link`, amber glyphs `colors.iconAccent`. Text on amber is `colors.onPrimary`, on semantic fills `colors.text.onColor`, on photos `colors.text.onMedia`. Web: `--color-primary-text`.
- **Type.** Spread a role (`...typography.styles.title`), never set `fontSize`+`fontFamily` by hand. Roles: `display h1 h2 h3 title body bodyBold bodyMedium lead label labelStrong caption small micro badge price overline`.
- **Elevation.** `...colors.elevation.sm|md|lg`, spread FIRST. Dark separates with a hairline, light with a shadow. No raw `shadows.*`.
- **Category colours.** Anything rendering one as *text* passes it through `toneForTheme(hex, isDark)`; `withAlpha(hex, a)` builds the tint. On an elevated surface use `tintOn(hex, alpha, colors.surface)` — Android draws the shadow through a translucent fill.
- **Switch.** `colors.switch.thumb` / `colors.switch.track`.
- **Motion.** `<PressableScale>` for presses, `<FadeSlideIn index={i}>` for list entrances.
- **Tablet.** `isTablet` is read once at load. Content caps: 800 (detail) / 680 (forms, lists) / 480 (auth), as `{ maxWidth, alignSelf: 'center', width: '100%' }`; sheets cap at `SHEET_MAX_WIDTH` (640). Phones are portrait-locked.

**Server state.** React Query everywhere (`src/services/queryClient.js`). After a post mutation call `invalidatePostData()`; socket handlers call `invalidatePostDataSoon()`. The detail screen opens on `findListedPost(postId)` as placeholder data. `utils/cacheManager.js` is only the offline fallback inside services — never cache screen data with it.

**Categories.** `useCategorySchemas()` / `useActiveCategorySchemas()`; `getPostTypeConfig(type, colors, schemas)` resolves icon and colour; forms via `formUtils.getInitialFormData/getEditFormData(schema, …)`; labels via `postUtils.getSchemaLabel/getSubcategoryLabel`.

**Admin.** Tabs `Browse` `Approval` `Reports` `Profile`; `AdminUsers` and `AdminAnalytics` are stack screens reached from `AdminProfile`. Category editing is web-only. Admin is `is_admin` from `userService.isAuthenticated()`, not `userType`.

**LikeButton.** Every call site gates admins and providers itself; the component's own `hidden` fallback is skipped in every list.

⚠ **Stack swipe-back is iOS-only** (`gestureEnabled` in `App.js`). On Android the JS stack's pan handler swallowed every horizontal list on a pushed screen — the detail gallery would not page.

⚠ **BottomSheetModal.** `PanResponder` captures closures at mount — `onClose` is mirrored into a ref; keep that pattern.

**Keyboard.** Wrap anything with an input in `<KeyboardAvoider>` (`inModal` inside a Modal) — never RN's `KeyboardAvoidingView`. `ScreenLayout` and `BottomSheetModal` already include it. Android pads by the measured overlap (`useKeyboardOverlap`), right whether the window resized or not; `app.json` is `softwareKeyboardLayoutMode: "resize"` because `pan` slid the window on top of that padding.

**i18n.** Locales `mn en zh ru` in `src/i18n/locales/`; locale is persisted by `AppContext.setLocale`.

## Known issues

| | Issue | Location |
|---|---|---|
| 🔴 | `PLAN_PRICE_PROVIDER_MNT` defaults to a placeholder (49,900₮). Set the real price before QPay credentials go in | `engine/payment/payment.service.ts` |
| 🟡 | Featured placement is unsellable until `FEATURED_PRICE_PER_DAY_MNT` is set | same |
| 🟡 | Google Maps key ships in `app.json`; restrict it by package (`com.khashaa.zuuchmap` — do not change after store release) + SHA-1 | `zuuchmap_app/app.json` |
| 🟡 | Prod Postgres SSL uses `rejectUnauthorized: false` | `app.module.ts` |
| 🟡 | Web admin role is client-side routing only (endpoints are guarded) | `web/src/App.jsx` |
| 🟡 | Static assets are uncompressed, HTTP/1.1 and uncached, and the SEO routes are unreachable, until the nginx blocks are added by hand | deploy `SKILL.md` |
| 🟡 | The map ships every pin in one response (`MAP_PIN_LIMIT` 5000); the fix is a viewport-bounded query | `post.service.ts` `findForMap` |
| 🟡 | `@sentry/react-native`, `expo-updates`, `expo-screen-orientation` do nothing until the next EAS rebuild; Sentry additionally needs `EXPO_PUBLIC_SENTRY_DSN` set as an EAS environment variable, which nothing in the repo does | `app/app.json` |
| 🟡 | `migration:generate` is unusable: migrations name constraints and indexes by hand and the entities do not, so a dry run proposes ~120 renames and would drop `search_vector`, the booking exclusion constraint and the partial unique indexes. Write migrations by hand | `src/migrations/` |
| 🟡 | `react-native-maps` 1.20.1 rasterises custom markers into 100×100 px on Android; pins are sized from `MARKER_MAX_DP` and carry no shadow | `CustomerMapView.jsx` |
| 🟢 | Without `REDIS_URL` the engine is single-instance only | `utils/redis.ts`, `ecosystem.config.js` |
