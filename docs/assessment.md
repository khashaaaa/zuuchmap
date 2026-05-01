# Zuuchmap — Project Assessment

**Date:** 2026-04-26  
**Scope:** zuuchmap_engine (NestJS), zuuchmap_web (React), zuuchmap_app (React Native/Expo)

---

## What the project is

A Mongolian construction marketplace. Providers post rentals, job vacancies, and services across 8 categories. Customers browse, filter, save, and contact providers. Admins approve posts before they go live. Three separate deployments share one backend.

It is functional and structurally sound. The architecture is appropriate for the scale. The issues below are not fundamental — they are the natural result of building fast, and they all have clean solutions.

---

## What is working well

- **Design system** — `theme.js` is thorough. Colors, spacing, radius, shadows, typography, and animations are all tokenized. Most of the app uses them correctly.
- **i18n** — 5 languages (MN/EN/ZH/RU/ES) across all three parts. The structure is consistent.
- **API organization** — NestJS modules are clean and well-separated. Each domain (post, user, company, auth, admin) owns its own controller, service, entity, and DTOs.
- **Category system** — `CategorySchema` in the backend is data-driven with per-category field definitions. This is the right foundation for expanding into new verticals without code changes.
- **Image handling** — Sharp compression on upload (quality 0.7, max 1200×1200). Multiple images per post. Separate upload paths per resource type.
- **Caching** — AsyncStorage caching with TTLs in the app (map posts 15min, post list 10min, category schemas 1h).
- **Real-time infrastructure** — Socket.io gateway exists on the backend and the web already listens to it. The plumbing is in place.

---

## Critical issues

### 1. Admin access is hardcoded in two separate files

`zuuchmap_engine/src/admin/admin.guard.ts` and `zuuchmap_web/src/lib/auth.js` each contain the same hardcoded phone number array `['80088253', '85655369', '91197773']`. Adding or removing an admin requires editing two files in two codebases and redeploying both. This will cause a silent inconsistency the first time someone forgets to update both. Move to a database-driven role or a single shared environment variable.

### 2. Web admin check is client-side only

The web app determines "is this user an admin" by checking the phone number against the hardcoded list in the browser. This is only a UI concern (backend guards the actual endpoints), but it means the routing logic and display logic can be bypassed by anyone who reads the source. The web should receive an `is_admin` flag from the backend on login instead.

### 3. `synchronize: true` in TypeORM

The backend auto-migrates the schema on every startup. This is safe for development but will silently drop columns or alter constraints in production if an entity changes. This needs to be switched to explicit migrations before the app handles real user data at scale.

### 4. OTP is not actually sent

`auth.controller.ts` accepts OTP but the implementation does not send an SMS. The flow works in development because the code is likely returned in the response or hardcoded. Real SMS delivery must be wired before public launch.

### 5. Push notifications are never sent

`zuuchmap_engine/src/utils/pushNotification.ts` exists and the app registers for tokens, but the utility is never called from any service. Post approval/rejection never notifies the provider. This is one of the most valuable UX moments (your post was approved) and it is silently dropped.

### 6. Stale closure in BottomSheetModal

`PanResponder.create()` captures `onClose` from props at mount time inside `useRef`. If the parent re-renders with a new `onClose` reference, the pan responder silently uses the old one. Fix: store `onClose` in a ref (`const onCloseRef = useRef(onClose); useEffect(() => { onCloseRef.current = onClose; }, [onClose])`) and call `onCloseRef.current()` inside the responder.

---

## What to add

### High priority (missing obvious functionality)

**Help & Support screen** — `profile.helpSupport` is translated in all 5 languages and appears as a tappable row in `ProviderProfile` and `CustomerProfile`. It goes nowhere. At minimum it should show a contact number/email. At best it links to a chat or FAQ.

**Notifications screen** — Same situation. `profile.notifications` is a rendered row with no target screen.

**Terms screen** — The backend has a full `/terms` CRUD module mirroring `/privacy`. The app and web only show Privacy Policy. Terms of Service should exist alongside it, especially for a marketplace.

**Post approval push notification** — Wire `pushNotification.ts` into `admin.service.ts` after approve/reject. The infrastructure (Expo project ID registered, push tokens stored on User) is fully in place. This is a two-function call away.

**Real OTP delivery** — Integrate an SMS provider (Twilio, Vonage, or a local Mongolian SMS gateway). The endpoint contract is already correct.

### Medium priority (product completeness)

**Messaging / inquiry system** — The Socket.io gateway is idle beyond post event broadcasts. A simple inquiry thread (customer → provider per post) would dramatically increase conversion. The real-time infrastructure is ready; it needs a new `Message` entity and two screens.

**Provider analytics** — The backend tracks `views` per post and like stats are queryable. A basic chart on the provider dashboard showing views over time per post would be high value. Recharts is already a dependency in the web.

**Post expiry flow** — `Status.EXPIRED` exists as an enum value but nothing sets it. A scheduled job (cron) should mark posts as expired after N days and notify the provider.

**Customer post recommendation** — Currently customers see all posts in a list. The viewed-post table (`viewedpost`) is populated but never read back. Even a simple "you haven't seen these yet" filter would improve browsing.

**Search** — `SearchInput` exists and works within a category browse. There is no cross-category search. A single `GET /posts?q=text` endpoint with full-text search on title/details would power this.

### Low priority (quality of life)

**System theme** — `settings.system` is translated and rendered as an option in the app's settings but `useAppTheme` does not read `useColorScheme()`. Either implement it or remove the option.

**Biometric auth UX** — The biometric enrollment flow is separate from the main auth. If a user installs fresh on a new device, biometric enrollment is lost but the app may try to route them to the biometric screen. The fallback to phone/OTP needs to be explicit and tested.

---

## What to remove

**`categoryBreadcrumb` style in PostDetailScreen** — The component was removed but the style entry remains in `createStyles`. Dead style.

**Unused `colors` import in BottomSheetModal** — `colors` is imported from `'../design/theme'` at the top of the file but all color usage goes through `useAppTheme()`. The named import is unused.

**`IOSPickerModal`** — There are two separate picker abstractions: `PickerButton` (used broadly) and `IOSPickerModal` (unclear usage). Audit and collapse to one.

**`UpdateLikedpostDto` and `UpdateViewedpostDto`** — These DTOs were generated by NestJS scaffolding but engagement records are never updated — only created or deleted. Remove them.

**`MESSAGES.COMING_SOON`** in app config — Defined but referenced nowhere in the codebase. Dead constant.

**ProviderPostCreate + ProviderPostEdit as separate files** — They share 90%+ of their JSX and logic. The only difference is POST vs PATCH and whether an existing post is loaded. Merge into a single `ProviderPostForm` screen with a `postId` param (undefined = create, defined = edit). This is the highest-impact code reduction in the mobile app.

---

## Scalability assessment

### What will scale without changes

- The NestJS module structure handles new categories cleanly — add a `CategorySchema` record, the rest is data-driven
- The `attributes` JSONB column on `Post` absorbs arbitrary per-category fields without schema changes
- i18n structure makes adding a new language a single new locale file
- React Query + Zustand in the web is appropriate for the traffic level

### What will break under growth

- **Image storage on disk** — uploads go to the server filesystem. This breaks with multiple backend instances and loses data if the server is reprovisioned. Move to S3-compatible object storage (AWS S3, Cloudflare R2, or DigitalOcean Spaces).
- **Hardcoded admin list** — already discussed. Breaks operationally long before technical scale is a concern.
- **No rate limiting on OTP** — `POST /auth/otp/send` has no throttling in the code. Anyone can enumerate phone numbers or spam SMS costs at will.
- **Single Stack navigator in the app** — All 28 screens live in a flat `<Stack.Navigator>`. As the app grows, nested navigators (tab navigator inside stack, or separate stack groups) will be needed for correct back-button behavior and better UX transitions.
- **`synchronize: true`** — already discussed. Will cause data loss in production.

### What is well-positioned for expansion

The `CategorySchema` system is genuinely good. Adding "agriculture", "events", "real estate" or any new vertical requires only inserting a new record with field definitions — no code changes needed in the backend or frontend. This is the right design for a platform that will "broaden into more categories."

---

## Priority order

1. Fix `synchronize: true` → migrations (data safety)
2. Wire push notifications on post approve/reject (immediate user value)
3. Real OTP delivery (required for production)
4. Move images to object storage (required for reliability at scale)
5. Merge ProviderPostCreate/Edit (reduces ongoing maintenance cost)
6. Fix stale closure in BottomSheetModal (correctness bug)
7. Add Help, Notifications, and Terms screens (removes dead UI rows)
8. Move admin role to DB or env var (security hygiene)
9. Implement system theme or remove the option
10. Add cross-category search endpoint

---

## Architectural diagram (text)

```
┌─────────────────────────────────────────────────────────────┐
│  zuuchmap_app (Expo/RN)        zuuchmap_web (React/Vite)    │
│  Single Stack Navigator        React Router v7               │
│  AsyncStorage cache            TanStack React Query cache    │
│  Zustand (locale/theme)        Zustand (auth/theme)          │
└───────────────┬─────────────────────────┬───────────────────┘
                │  HTTPS + JWT            │  HTTPS + JWT
                │  Socket.io              │  Socket.io
                ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│  zuuchmap_engine (NestJS, port 8282, prefix /engine)        │
│                                                             │
│  Modules: auth · user · post · company · likedpost         │
│           viewedpost · admin · privacy · terms             │
│           account-deletion · events (Socket.io gateway)    │
│                                                             │
│  TypeORM → PostgreSQL                                       │
│  Multer → /uploads/{profilepicture,companylogo,posts}       │
│  Sharp → image compression                                  │
└─────────────────────────────────────────────────────────────┘
```
