# CLAUDE.md — Zuuchmap

Construction marketplace for Mongolia. Providers post rentals/services/jobs across 8 categories; admins approve posts before they go live; customers browse, filter, save, contact.

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
**Env:** `config/variables/development.env` — `PG_*` `JWT_SECRET` `ADMIN_PHONES` `OTP_OVERRIDE` `R2_*`  
**DB:** `synchronize: false` — TypeORM migrations (`src/migrations/`, `data-source.ts`).  
**⚠ `migrationsRun: true`** — the dev server auto-runs any pending migration file on (re)start, including watch-mode restarts. Never leave a broken/experimental migration file on disk while `npm run dev` is running.  
**Uploads:** Cloudflare R2 via S3 client (`src/utils/uploader.ts`), magic-byte validation, Sharp compression.

**Modules:** `auth` `user` `post` `company` `likedpost` `viewedpost` `admin` `content-page` `events` `booking` `review`  
**Post module services:** `PostService` (posts, expiry cron, notifications) · `CategoryService` (`post/category.service.ts` — schemas, validation, seeding; unit-tested in `category.service.spec.ts`, run `npx jest`)

**Key endpoints:**
```
POST /auth/otp/send|verify
GET  /user/profile                JWT
GET  /posts                       ?category&subcategory&province&district&approval_status
                                  &q&attr.<key>[=|_min=|_max=]&page&limit
                                  → { items, total }   (all other list endpoints return arrays)
GET  /posts/mine                  JWT
POST /posts                       multipart JWT
GET  /posts/categories/all
POST /like  DELETE /like/:type/:id  GET /like/ids
GET  /admin/posts/pending
PUT  /admin/posts/:id/approve|reject   JWT+AdminGuard
POST /bookings                    JWT   {post_id,start_date,end_date,message?}
GET  /bookings/mine|received      JWT
PUT  /bookings/:id/accept|decline|cancel  JWT
POST /reviews                     JWT   {provider_id,rating,comment?} (upsert)
GET  /reviews/provider/:id             → {average,count,reviews,own}
```

**Bookings/reviews rules (enforced server-side):** only `has_rental_status` categories are bookable; no self-booking; one PENDING request per customer per post; accept refuses date overlap with an ACCEPTED booking; contact phone shared only after ACCEPTED; reviews require ≥1 ACCEPTED booking with the provider, one per author (upsert).

**Category system (data-driven — never hardcode category behavior in clients):**
- `CategorySchema` holds fields (`FieldDef[]`), subcategories, behavior flags
  (`has_rental_status` `has_availability_dates` `has_price` `default_price_unit`),
  and localized `labels` (`{mn,en,zh,ru}`) on category/subcategory/field level.
- Clients derive form sections, status toggles, and filter UIs from these flags.
- `FieldDef.filterable` exposes an attribute as a browse filter (`attr.<key>` query param).
- `q` is Postgres full-text (prefix-matching tsvector over title+details).
- Post has `category` + `subcategory` only; legacy `secondcategory` still accepted as DTO input alias.

**Admin guard:** `src/admin/admin.guard.ts` — reads `ADMIN_PHONES` env, exports `isAdmin()`.  
Web/app read `is_admin` from JWT response — they do not duplicate the list.

**Entities:** User · Post · Company · Likedpost · Viewedpost · CategorySchema · Booking · Review · ContentPage  
**Enums:** `UserType` `ApprovalStatus` `Status` `PriceUnit` `Province` `District` `BookingStatus`

---

## Web (`zuuchmap_web/`)

**Entry:** `src/main.jsx` → `App.jsx`. Alias `@` → `src/`.  
**HTTP:** `src/lib/api.js` — Axios, auto-JWT, redirects `/login` on 401.  
**State:** `useAuthStore` + `useThemeStore` + `useNotificationStore` (Zustand, `src/store.js`); everything else React Query.  
**Realtime:** `hooks/useRealtimeSync.js` — Socket.io (JWT auth), invalidates queries on events.  
**i18n:** `src/i18n/` — `en mn zh ru`.

**Key utilities** (`src/lib/utils.js`): `getPostCategory(post)`; `getCategoryLabel` / `getSubcategoryLabel` / `getFieldLabel` — resolve schema `labels[locale]` first, then client i18n, then raw label. Always use these for category-related display text.

**Routes:**
```
Public:   /login /verify /onboarding /posts/:id
Shared:   /privacy /terms /help /account-deletion
Admin:    /admin /admin/posts /admin/posts/:id /admin/users /admin/users/:id
          /admin/categories /admin/profile
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
- `src/config/app.config.js` — `POST_TYPES` (8), `IMAGE`, `VALIDATION`, `provinces`/`districts`
- `src/design/theme.js` — `palettes.dark/light` (Direction A: neutral grounds, amber accents), spacing, radius, typography; tablet scaling via `isTablet`. **No static `colors`/`globalStyles` exports** — get `{ colors, styles }` from `useAppTheme()`; per-file color styles use `themedStyles((colors) => ({...}))`. Text on amber fills uses `colors.onPrimary`; on semantic fills `colors.text.onColor`. Web mirrors the same values in `zuuchmap_web/src/index.css` — change palettes in both places.

**Server state:** TanStack React Query everywhere — client from `src/services/queryClient.js` (wired in `App.js` with AppState focus manager). After any post mutation or socket event call `invalidatePostData()` from that module; it clears both React Query caches and the AsyncStorage offline fallbacks. `utils/cacheManager.js` is only the offline-fallback layer used inside services (map posts, category schemas) — never cache screen data with it.

**Seeded post types:** `vehiclerent toolrent machineryrent materialstore factory construction jobvacancy sos` — but categories come from the API (`CategorySchema`); form behavior is driven by schema flags via `formUtils.getInitialFormData/getEditFormData(schema, …)`, and labels via `postUtils.getSchemaLabel/getSubcategoryLabel`.

**Admin detection:** `is_admin` from `userService.isAuthenticated()` — phone-based, not `userType`.  
**LikeButton:** hides itself for admins via `hidden` state in `initializeLikeData()`.  
**⚠ BottomSheetModal:** `PanResponder` captures closures at mount — `onClose` is mirrored into a ref; keep that pattern when editing.

**i18n:** `src/i18n/locales/` — `en mn zh ru`.

---

## Known issues

| Priority | Issue | Location |
|---|---|---|
| 🔴 | OTP not sent via SMS — code returned directly in send-otp response; `OTP_OVERRIDE` env works for dev, production needs a real SMS provider | `auth/auth.controller.ts:35` |
| 🟡 | Prod Postgres SSL uses `rejectUnauthorized: false` (no CA validation) | `app.module.ts:50` |
| 🟡 | Web admin role is client-side routing only — backend endpoints are guarded, but the UI trusts `is_admin` from the JWT response | `web/src/App.jsx` |
