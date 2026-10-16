# CLAUDE.md — Zuuchmap

Construction marketplace for Mongolia. Providers post rentals/services/jobs across 13 categories in four families; admins approve posts before they go live; customers browse, filter, book, save, chat.

**Fresh start (decided 2026-10-15).** Zuuchmap is built from zero in this repo — engine, web and app on the Figma design — and launches on an empty database: no data, no code carries over from the old product. The old code (`zuuchmap_engine/`, `zuuchmap_web/`, `zuuchmap_app/`, `check:sync`, the old deploy skill) was deleted; it is in git history up to commit `a4bd91a` if a detail is ever needed. The old site still runs on the VPS until launch (see Deployment).

## Rules

- **Git only when ordered** (the global rule). When ordered: `git add -A`, commit, push. Nothing else.
- **No yarn.** Use `npm` everywhere.
- **Read targeted.** grep/find first, read only the needed range.
- **No speculative cleanup.** Only change what the task requires.
- **No bloatware.** Prefer editing existing files over creating new ones.
- **Bigger picture.** When fixing an issue, scan the whole codebase for the same pattern, report all locations, ask before acting.

## Commands

One npm workspace (`apps/*`, `packages/*`); `npm install` at the root.

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # PostGIS 5433, Redis 6380, mailpit 1025/8025
npm run dev -w @zuuchmap/engine                         # port 8383
npm run dev -w @zuuchmap/web                            # port 5174
npm run db:reset -w @zuuchmap/engine                    # rebuild + reseed the dev DB
npm run gate:all                                        # every gate CI runs
```

**Local env:** `apps/engine/.env` (from `.env.example`: local VAPID keys, SMTP → mailpit, `ADMIN_PHONES=99100000`), `apps/app/.env` (`EXPO_PUBLIC_API_URL` = this PC's LAN IP). The web needs none: Vite proxies `/api` and `/socket.io` to 8383. `nest start --watch` leaves a detached `node dist/main` behind — stop the engine by killing the pid on 8383.

**Seed** (`db:reset` runs it; `seed:dev` alone reseeds in ~2 s, deterministic): 20 hand-written listings with bookings in every state, two threads and reviews — provider 99110000 (Хүнд Техник ХХК), customers 99120000 and 99130000, admin 99100000 — then `scripts/seed-bulk.ts` generates a market: 80 providers (9850xxxx), 250 customers (9860xxxx), ~1,600 listings in every category and province (no photos), 900 bookings, 450 threads, 600 reviews, saves, saved searches.

**Dev auth** (not production and `VERIFY_MN_API_KEY` unset): any number signs in and the session self-verifies. Past the verify throttle: `docker exec infra-redis-1 redis-cli del hit:verify:<phone>` and delete that phone's `verification_session` rows. A token without the flow: `openSession(dataSource, <user id>, cfg)` from `apps/engine/src/auth/request-user` (a token counts only while its `auth_sessions` row exists; a bare `signHs256({ sub })` is rejected).

### Web/app parity

1. **Identical — the same fact rendered twice.** A price, date, time, phone, status label, category name, count. It lives once in `@zuuchmap/core` and both clients import it.
2. **Equally available — anything done in a transaction.** Browse, save, message, report, book, renew, pay, review, saved searches. Guest affordances count: a named sign-in prompt on one client means one on the other.
3. **Free to differ — how a capability is reached.** Navigation shape, density, input modality, platform transports.

**Admin is deliberately not at parity.** The app carries the queues (approval, reports); the web carries configuration and look-ups (category schemas, user detail, company verification, broadcast, featured grants).

## Design (Figma)

The Figma file is the source of truth: "polish the design" means edit Figma, then re-export tokens/specs. Signal orange `#FF6A1F` on ink, Geologica self-hosted (**never Google Fonts** — its `unicode-range` subsets strand Ө/Ү/₮), pin-Z mark, Lucide, four category families, "Чат" for messages ("мессеж" for one message).

- **Plan** — https://claude.ai/artifact/RvMduJcCDnAoHdnwj4KgNZ (read with the Artifact tool): what the product must solve, the business rules, new capabilities and the engine data each needs, architecture, the 12-phase build order with "done when" criteria, launch.
- **Figma** — https://www.figma.com/design/c9ds9j1tM48XCIvCDrIQKc (fileKey `c9ds9j1tM48XCIvCDrIQKc`). Load the `figma:figma-use` skill, then `use_figma` / `get_screenshot`.
- **Pages** (id): Cover `0:1` · Brand `2:2` (export assets `4:2`) · Foundations `2:3` · Icons `9:2` · Illustrations `20:2` · Components `2:4` · Patterns `2:5` · 1 Entry `83:2` · 2 Customer `21:2` · 3 Provider `34:2` · 4 Shared & admin `48:2` · **Handoff `56:2`** · 5 Store `61:2` · 6 Tablet `100:2` · 7 As built `364:2` (live web screenshots per frame code, not a design).
- **Offline copy** — `design/` (README there): every frame light+dark, the boards, `frames.tsv`, the as-built screenshots and `drift.md` (CHOICE / AHEAD / BEHIND per screen). Re-render after design changes. A local Penpot (`~/penpot`, `docker compose -p penpot up -d`, http://localhost:9001, creds `~/.penpot.env`, MCP server `penpot` in the user config) holds the file converted by the Penpot Exporter plugin (`.penpot` copies in `~/backups/zuuchmap/penpot/`); its texts use the team's uploaded Geologica (`custom-2be40818-…`), not Google's.
- **Frames** are named `<code> · <screen>` (`B2 · Listing detail`), each with a `… · Dark` twin. Each screen page has a `Phone` and a `Desktop` section; a desktop frame is its phone frame's code plus `d` (`B2d`), a desktop-only screen the next number in its family plus `d`. Find one with `page.findAllWithCriteria({types:['FRAME']}).filter(f => f.name.startsWith('B2 ·'))`.
- **Variables:** `Primitives` · `Color` (Light/Dark) · `Spacing` · `Radius` · `Motion`; 17 `type/*` text styles; `elevation/sm|md|lg`.
- **Handoff page** is the build spec: 01 accessibility, 02 tokens, 03 components, 04 build order, 05 defects not to repeat. The plan and the Handoff page carry the same build order — change both together.

## Workspace (`apps/*`, `packages/*`, `infra/`)

| Package | What | Gate |
|---|---|---|
| `packages/tokens` (`@zuuchmap/tokens`) | `src/figma.json` is the Figma variable export (Primitives · Color Light/Dark · Spacing · Radius · Motion · type/* · elevation/*). `build.mjs` (zero deps, runs on `prepare`) writes `dist/tokens.css` (CSS vars; dark on `[data-theme="dark"]`, light island on `[data-theme="light"]`), `dist/tailwind.css` (`@theme inline`), `dist/index.ts` (RN theme: `light`/`dark`, `type` roles with bundled face names, `elevation`, `categoryColor`). `fonts/` = Geologica static TTFs (400–800) + `Geologica[wght].woff2`. **Edit Figma, re-export, rebuild — never hand-edit dist.** | `npm run gate:tokens` |
| `packages/core` (`@zuuchmap/core`) | Formatters (`formatPrice`/`formatPriceParts`/`formatDate`… take a `locale`, resolve labels from the bundled resources), validation, enums (`Province`/`District`/`PriceUnit`/`ERROR_CODES`…), i18n `resources` (mn en zh ru), category families (`familyOf`, `categoryIconFallback`), API types, analytics event names. Zero runtime deps; a test fails on any `Intl`/`toLocale*`. The one copy of every fact both clients render. | `npm run gate:core` |
| `apps/engine` (`@zuuchmap/engine`) | NestJS 11, prefix `/api`, port **8383**; one module per domain under `src/` (the controllers are the endpoint list). `src/config/load-env.ts` first import; `.env.example` lists every variable. **One schema migration, `src/migrations/1760500000000-schema.ts`, one block per table in FK order — edited in place until launch** (nothing outside dev/test has run it); after an edit, `npm run db:reset -w @zuuchmap/engine` drops `public`, migrates and reseeds (~4 s), and the test DB rebuilds itself when the migration files' hash changes (`src/database/reset.ts`, stored as the `public` schema comment). **At launch the file freezes**: from then on, new append-only migrations beside it, never an edit. Written by hand (`migrationsRun: false`; `npm run migration:run -w @zuuchmap/engine`). Tests never touch the dev DB: jest's `test/global-setup.ts` creates and migrates `<PG_DATABASE>_test`. Redis optional (`claimCron`); readiness at `/api/health/ready`. Lint is a gate (zero findings, `--no-fix`). **One request per screen need** (e.g. `GET /categories` answers `{ categories, families }`; `GET /notifications/badges` is the shell's counts; a draft is sent with `PATCH /posts/:id {…, submit: true}`). **Search:** all SQL is `post/search-terms.ts` `searchSql`; `SavedSearchService.matching(post)` is its JS twin (with `applyFilters`) — change both together; `test/search.e2e.spec.ts` is the must-find gate over shared fixtures. **Events:** every domain event goes on the `LISTING_EVENTS` bus; `NotificationService` always writes the centre row, then pushes per device in that device's `locale` (else e-mails), words from core `notificationCopy`; transports behind `NOTIFY_TRANSPORTS` (tests record). **Payments:** the invoice row is written before QPay is called; the callback is only a nudge — money is believed from QPay's `check`; settlement is one conditional UPDATE (callback and poll race → one grant), late money is still granted; `PAYMENT_GATEWAY` port (tests fake it). QPay sandbox: `QPAY_BASE_URL=https://merchant-sandbox.qpay.mn`, `TEST_MERCHANT`/`123456`/`TEST_INVOICE`. | `npm run gate:engine` |
| `apps/web` (`@zuuchmap/web`) | Vite + React 19 + TS + Tailwind 4, port **5174**. Theme = `data-theme` on `<html>` (`zm_theme`), bootstrap script in `index.html`. Components in `src/ui/`, one file each; gallery at `/kit`. Icons only through `src/ui/Icon.tsx` (whitelist; unknown → family icon). Web-only strings in `src/i18n/ui.ts` (the app's in `src/i18n/extra.ts`); a string both clients show lives in core (`kit.*` for UI-kit labels). | `npm run gate:web` |
| `apps/app` (`@zuuchmap/app`) | Expo 54 / RN 0.81 / TS. Same package id `com.khashaa.zuuchmap` and EAS project as the old App Store app (store identity carries over; `runtimeVersion` under Deployment). `src/design/theme.ts` `useAppTheme()`; `src/ui/` components; `src/screens/Kit.tsx` gallery. Metro is monorepo-aware. Phone test: `npx expo start --go --port 8082` + Expo Go 54.0.8 (traps in memory `testing`). | `npm run gate:app` |
| `infra/` | `docker-compose.dev.yml` (ports under Commands), `nginx/zuuchmap.conf` (installed on the VPS at launch), `postgres/zuuchmap.conf` (the server's Postgres tuning, in its `conf.d`), `pm2/ecosystem.config.cjs`, `backup/pg-backup.sh`. | — |

CI (`.github/workflows/ci.yml`, job `gates`) runs all five (`npm run gate:all`). Component specs were dumped from Figma with a `use_figma` script (`packages/tokens/figma-components.js`, a Plugin API script to paste into `use_figma`; re-dump when a component changes).

## Business rules

Phases 1–9 are built (web admin = configuration and look-ups at `/admin`; the app's admin tabs = queues). These rules hold for whatever implements them.

- **Phone verification (verify.mn, Mobile-Originated).** We never send an SMS: the *user* texts a displayed code to `144773` from the number they claim, at 150₮ per verification. It runs only at signup and on a new device — trusted devices store `sha256(device_id)` and a match returns a token directly. Web sign-out forgets the browser (shared computers); app sign-out keeps the phone trusted. A session is spent by one conditional `UPDATE`, and `users.phone_number` is unique — never a read-then-write on either. Sessions last a year because signing in again costs the user money.
- **Roles are server-enforced.** Everyone starts as a customer; the role is set once (asked on the first listing, never at sign-up). Listing, company and plan-invoice creation are provider-only on the engine (admins pass) — clients only hide those actions. Admins come from `ADMIN_PHONES`; clients read `is_admin`, never the list.
- **`req.user` is identity only.** Handlers read `id` and `phone_number` off it; anything mutable is read by the service that needs it.
- **Editing a live listing (`pending_revision`).** An APPROVED listing never leaves browse because its owner edited it: the proposal is parked in `pending_revision`, approve writes it onto the row, reject drops it, `approval_status` stays APPROVED. A PENDING or REJECTED listing is edited in place. Revision photos are referenced only by the revision, so reclaim covers both sets; `rejection_reason` on an APPROVED listing means *the edit* was refused. A proven provider (3+ approved, zero rejections, zero upheld reports) auto-publishes edits — never new listings.
- **Bookings / reviews.** Only `has_rental_status` categories are bookable; no self-booking; one PENDING request per customer per listing; accept locks the listing row, refuses overlap and declines overlapping PENDING requests (`OVERLAP`); price and title are copied at request; the contact phone is shared only after ACCEPTED; a booking outlives its listing (can be declined or cancelled, never accepted). Review eligibility: a finished booking **or** a thread the provider answered with text.
- **Reports** (phase 9). About a listing or a review; deleting either keeps the report (owner and subject copied at filing). One OPEN report per reporter per subject. A take-down rejects the whole listing (a pending edit included) or deletes the review, closes that subject's other open reports and tells each reporter.
- **Prices for sale.** `PLAN_PRICE_PROVIDER_MNT` / `FEATURED_PRICE_PER_DAY_MNT` have no defaults: unset = not for sale. A newer invoice of the same kind retires the older; featured days are cut to the listing's end.
- **Categories in use.** A field or subcategory that listings use is never removed or retyped (`CATEGORY_KEY_IN_USE`).
- **Contacts and trust.** A contact (call, first chat, booking request) counts once per viewer per kind per Ulaanbaatar day, never the owner. Reply time = median first text reply over 30 days, shown only with ≥3 threads. `notify_topics` silence push and e-mail, never the notification centre.
- **Account deletion.** `DELETE /user/account`: the user's live listings stay 14 days.
- **Expiry.** Listings lapse at midnight, a warning goes out three days before, and crons that push or settle call `claimCron()` so only one worker runs them.
- **Views.** One per viewer per listing, ever; only live listings; never the owner or an admin (recorded uncounted); anonymous viewers capped per address per day.
- **Categories are data.** Fields, subcategories, flags, icon, colour, family and `{mn,en,zh,ru}` labels are admin-editable — never hardcode category behaviour in a client.
- **Push permission is never requested at sign-in**; it is asked inline after posting, booking or saving a search.
- **Numbers and dates.** ₮ after the number, hand-rolled grouping, `YYYY.MM.DD`, 24-hour time, all through `@zuuchmap/core` — no `Intl`/`toLocale*` (Android's JSC lacks full ICU and silently formats en-US).

## Deployment

"The server" means **myserver**, the home test server (192.168.1.102, `ssh server`): the engine runs there at `http://192.168.1.102:8383/api` as the user service `zuuchmap-engine` (`~/zuuchmap/apps/engine`, own `.env`, dev auth on), against system Postgres 18 + PostGIS and Redis; DB password in `~/.zuuchmap-db-password`. Update it: rsync the repo (no `node_modules`/`dist`/`.env`), `npm install`, build tokens → core → engine, `systemctl --user restart zuuchmap-engine`. The `zuuchmap` DB role lacks `CREATEDB`, so the jest suite cannot run there until `ALTER ROLE zuuchmap CREATEDB`.

Nothing is in production yet. At launch the new stack goes onto the existing VPS (`infra/`: nginx, pm2, backup) in place of the old site.

- **VPS** `ubuntu@158.69.212.75` — password auth only (use paramiko; `sshpass` is not installed). Node via nvm (v24.11.1; prefix remote commands with its `PATH`), Postgres 16, nginx with letsencrypt. Credentials (`VPS_*`, `GH_*`) in `~/.zuuchmap-deploy.env`.
- **The old site** still runs there: engine `/var/www/zuuchmap_engine` (pm2 `zuuchmap_engine`, port 8282, nginx `/engine`), web `/var/www/zuuchmap_web`. It can no longer be deployed from this repo. Its env files (R2, verify.mn and JWT keys), deploy/snapshot/restore-drill scripts and server notes are in `~/backups/zuuchmap/vps-bundle/legacy/` (chmod 700, never commit) — the R2 and verify.mn credentials are what production needs at launch.

**App releases.** `expo-updates` is wired, so a JS-only fix ships with `eas update`. `runtimeVersion` is a bare native-ABI counter (`"2"`) and changes **only when native code does** — never back to `"1"`: that is the old App Store binary on the same EAS project, and an update would reach it and crash it.

## Known issues

| | Issue | Location |
|---|---|---|
| 🔴 | The real provider plan price and the featured price per day are undecided; until `PLAN_PRICE_PROVIDER_MNT` / `FEATURED_PRICE_PER_DAY_MNT` are set, neither is for sale (dev `.env` uses Figma's 49,900₮ and 5,000₮) | plan, phase 8 |
| 🟡 | Google Maps key ships in `app.json`; restrict it by package (`com.khashaa.zuuchmap`) + SHA-1 | `apps/app/app.json` |
| 🟡 | Android remote push works (verified 2026-10-16 on a local release build: background, killed, swiped away; custom `notify` sound). Store builds still need Android signing credentials. A tap on a push after Android itself killed the backgrounded app (task kept in Recents) opens Home, not the target: expo-notifications 0.32 restores the task's launcher intent; a swipe-away cold start routes correctly | `apps/app` |
| 🟡 | `migration:generate` is unusable: migrations name constraints and indexes by hand and the entities do not. Write migrations by hand | `apps/engine/src/migrations/` |
