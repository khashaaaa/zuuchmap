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

## Deployment

`.claude/skills/deploy/deploy.sh` — one-command production deploy (push → DB backup → engine pull/build/migrate/pm2 restart → web build → smoke test). Server facts and gotchas in `.claude/skills/deploy/SKILL.md`. Credentials in `~/.zuuchmap-deploy.env` (never committed).

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

---

## Backend

**Entry:** `src/main.ts` — port `8282`, prefix `/engine`  
**Env:** `config/variables/development.env` — `PG_*` `JWT_SECRET` `ADMIN_PHONES` `R2_*` `VERIFY_MN_API_KEY` `PUBLIC_ENGINE_URL`  
**DB:** `synchronize: false` — TypeORM migrations (`src/migrations/`, `data-source.ts`).  
**⚠ `migrationsRun: true`** — the dev server auto-runs any pending migration file on (re)start, including watch-mode restarts. Never leave a broken/experimental migration file on disk while `npm run dev` is running.  
**Uploads:** Cloudflare R2 via S3 client (`src/utils/uploader.ts`), magic-byte validation, Sharp compression.

**Modules:** `auth` `user` `post` `company` `likedpost` `admin` `events` `booking` `review` `analytics`  
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
POST /posts                       multipart JWT
GET  /posts/stats                 public landing counters (cached 5m)
GET  /posts/categories/all
POST /like  DELETE /like/:type/:id  GET /like/ids
GET  /admin/posts/pending
PUT  /admin/posts/:id/approve|reject   JWT+AdminGuard
POST /bookings                    JWT   {post_id,start_date,end_date,message?}
GET  /bookings/mine|received      JWT
PUT  /bookings/:id/accept|decline|cancel  JWT
POST /reviews                     JWT   {provider_id,rating,comment?} (upsert)
GET  /reviews/provider/:id             → {average,count,reviews,own}
POST /analytics/collect                batched events, anonymous allowed
GET  /analytics/summary           JWT+AdminGuard  ?days=7|30|90
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
- `q` is Postgres full-text (prefix-matching tsvector over title+details).
- Post has `category` + `subcategory` only; legacy `secondcategory` still accepted as DTO input alias.

**Phone verification (verify.mn, Mobile-Originated):** we never send an SMS. `verify/start` registers a code; the *user* texts it to shortcode `144773` from the number they claim, and possession is proven by the message arriving from that number — so the code is not a secret and is rendered in the UI. Costs the end user 150₮ per verification, so it runs only at signup and on a new device: `TrustedDevice` stores `sha256(device_id)` and a match short-circuits to a token. Biometrics gate the locally-stored token on the device only; the server never accepts a biometric claim.

**Realtime:** `events/events.gateway.ts` — Socket.io rooms `admin` + `user:<id>` (legacy `provider:<id>` joins/emits kept for pre-rename app builds; drop when those are gone). Event names + payload shapes (`{postId, category, …}`) are exported as `SOCKET_EVENTS` and mirrored in `zuuchmap_web/src/lib/socket.js` and `zuuchmap_app/src/services/socketService.js` — change all three together. In the app, only `useNotificationSync` subscribes to the socket; screens never do.

**Admin guard:** `src/admin/admin.guard.ts` — reads `ADMIN_PHONES` env, exports `isAdmin()`.  
Web/app read `is_admin` from JWT response — they do not duplicate the list.

**Entities:** User · Post · Company · Likedpost · Viewedpost · CategorySchema · Booking · Review · VerificationSession · TrustedDevice · AnalyticsEvent  
**Enums:** `UserType` `ApprovalStatus` `Status` `PriceUnit` `Province` `District` `BookingStatus`

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
Admin:    /admin /admin/posts /admin/posts/:id /admin/users /admin/users/:id
          /admin/categories /admin/analytics /admin/profile
Provider: /provider /provider/posts /provider/posts/new /provider/posts/:id
          /provider/posts/:id/edit /provider/profile /provider/company /provider/bookings
Customer: /customer /customer/browse /customer/map /customer/saved /customer/profile
          /customer/bookings
```

---

## App (`zuuchmap_app/`)

**Entry:** `App.js` → `Stack.Navigator`. Initial route: `src/utils/navigationUtils.js → getInitialRoute()`.

**Key configs:**
- `src/config/api.config.js` — `API_BASE_URL`, `ENDPOINTS`, `STORAGE_KEYS`
- `src/config/app.config.js` — `IMAGE`, `VALIDATION`, `provinces`/`districts` (bare code arrays; labels come from i18n `province.<CODE>`/`district.<CODE>`, mirrored in `zuuchmap_web/src/lib/utils.js`)
- `src/design/theme.js` — `palettes.dark/light` (Direction A: neutral grounds, amber accents), spacing, radius, typography; tablet scaling via `isTablet`. **No static `colors`/`globalStyles` exports** — get `{ colors, styles }` from `useAppTheme()`; per-file color styles use `themedStyles((colors) => ({...}))`. Text on amber fills uses `colors.onPrimary`; on semantic fills `colors.text.onColor`; on photography `colors.text.onMedia` (white in both palettes by design). Web mirrors the same values in `zuuchmap_web/src/index.css` — change palettes in both places.
  - **Type scale.** Spread a role — `...typography.styles.title` — never set `fontSize`+`fontFamily` by hand, so line-height and tracking travel with the size. Roles: `display h1 h2 h3 title body bodyBold bodyMedium lead label labelStrong caption small micro badge price overline`. `title` (18) is the card/row heading that does the scanning work in a list; `price` is its own rung; `overline` is for text set in caps.
  - **Elevation.** `...colors.elevation.sm|md|lg` — spread it FIRST in a style object so anything declaring its own `borderColor` after it wins. One idiom per theme, never both: dark separates with a hairline (black shadows are invisible on a dark ground), light separates with a soft shadow. `lg` keeps a shadow on both — modals sit over a scrim. `elevation.selected` is the amber selected state. Do not reintroduce raw `shadows.*` at a call site.
  - **Category colours.** `categoryColors` holds the eight fallbacks; the live value is admin-editable `CategorySchema.color`. All are solved to one luminance so a single stored hex reads at 4.0:1 on *both* grounds and ~2:1 against amber — amber therefore always stays the brightest accent. Anything rendering a category colour as *text* must pass it through `toneForTheme(hex, isDark)` first (admins can save any hex); `withAlpha(hex, a)` builds the tinted fill. Mirrored in `zuuchmap_web/src/lib/utils.js` and seeded in `post/category.service.ts` — change all three together.
  - **Motion.** `animations.duration/press/stagger`. Card and button presses use `<PressableScale>` (spring scale, honours reduce-motion) rather than `activeOpacity` alone; list entrances use `<FadeSlideIn index={i}>`; screen transitions are set in `App.js` `screenOptions`.

**Server state:** TanStack React Query everywhere — client from `src/services/queryClient.js` (wired in `App.js` with AppState focus manager). After any post mutation or socket event call `invalidatePostData()` from that module; it clears both React Query caches and the AsyncStorage offline fallbacks. `utils/cacheManager.js` is only the offline-fallback layer used inside services (map posts, category schemas) — never cache screen data with it.

**Seeded post types:** `vehiclerent toolrent machineryrent materialstore factory construction jobvacancy sos usedequipment transport designservice miningsupport winterservice` — but categories come from the API (`CategorySchema`); form behavior is driven by schema flags via `formUtils.getInitialFormData/getEditFormData(schema, …)`, and labels via `postUtils.getSchemaLabel/getSubcategoryLabel`.

**Category schemas:** `hooks/useCategorySchemas.js` → `useCategorySchemas()` / `useActiveCategorySchemas()`. Use these for any per-category affordance; `getPostTypeConfig(type, colors, schemas)` resolves icon+colour from the schema.

**Admin detection:** `is_admin` from `userService.isAuthenticated()` — phone-based, not `userType`.  
**LikeButton:** hides itself for admins via `hidden` state in `initializeLikeData()`.  
**⚠ BottomSheetModal:** `PanResponder` captures closures at mount — `onClose` is mirrored into a ref; keep that pattern when editing.

**i18n:** `src/i18n/locales/` — `mn en`. (zh/ru retired; see web note.)

---

## Known issues

| Priority | Issue | Location |
|---|---|---|
| 🔴 | Android `package` is still the placeholder `com.yourcompany.zuuchmap`. Cannot be changed after a Play Store release without orphaning installs — decide before the next submission | `zuuchmap_app/app.json` |
| 🟡 | Google Maps key ships in `app.json` (unavoidable for the Maps SDK); it must be restricted by package name + SHA-1 in Google Cloud Console | `zuuchmap_app/app.json` |
| 🟡 | Prod Postgres SSL uses `rejectUnauthorized: false` (no CA validation) | `app.module.ts:50` |
| 🟢 | Multi-instance is Redis-gated. With `REDIS_URL` set: throttler storage → Redis (`@nest-lab/throttler-storage-redis`), cache invalidation → Redis pub/sub (`utils/cache-coordinator.ts`, per-process L1 + cross-instance clear), Socket.io → Redis adapter (`utils/redis-io.adapter.ts`). Then raise `PM2_INSTANCES`. **Unset `REDIS_URL` ⇒ single instance only** — each worker would otherwise split rate limits/cache/broadcasts. Localhost dev runs Redis-free (in-memory). | `utils/redis.ts`, `app.module.ts`, `ecosystem.config.js` |
| 🟡 | Web admin role is client-side routing only — backend endpoints are guarded, but the UI trusts `is_admin` from the JWT response | `web/src/App.jsx` |
