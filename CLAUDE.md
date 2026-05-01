# CLAUDE.md — Zuuchmap Working Reference

Full-stack construction marketplace for Mongolia. Three codebases share one backend.

| Directory | Purpose | Stack |
|---|---|---|
| `zuuchmap_engine/` | REST API + WebSocket | NestJS 11, TypeORM, PostgreSQL, Socket.io |
| `zuuchmap_web/` | Admin/Provider/Customer portal | React 19, Vite, Tailwind 4, Zustand, React Query |
| `zuuchmap_app/` | Mobile | React Native 0.81, Expo 54 |

See `docs/assessment.md` for the full project audit (issues, what to add, what to remove, scalability).

---

## Commands

### Engine
```bash
cd zuuchmap_engine
npm run dev        # watch mode, port 8282
npm run build
npm run lint       # ESLint + auto-fix
npm run format     # Prettier
npx jest           # tests (no test files yet)
```

### Web
```bash
cd zuuchmap_web
npm run dev        # Vite dev server
npm run build
npm run lint
```

### App
```bash
cd zuuchmap_app
yarn start         # Expo dev server
yarn android
yarn ios
```

---

## Backend

**Entry:** `zuuchmap_engine/src/main.ts` — port `8282` (env `PROG_PORT`), global prefix `/engine`  
**Config:** `config/variables/development.env` or `production.env` based on `NODE_ENV`  
**Env vars required:** `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PWD`, `PG_NAME`, `JWT_SECRET`  
**Uploads:** served at `/engine/uploads/`, stored in `uploads/{profilepicture,companylogo,posts,temp}`  
**⚠ `synchronize: true`** — schema auto-migrates on startup. Safe for dev, dangerous for prod.

### Module map

| Module | Files | Notes |
|---|---|---|
| `auth` | auth.controller, auth.service, jwt.strategy, jwt-auth.guard | OTP send/verify — SMS not wired yet |
| `user` | user.controller, user.service, user.entity | PROVIDER \| CUSTOMER types |
| `post` | post.controller, post.service, post.entity, category-schema.entity | Core marketplace logic |
| `company` | company.controller, company.service, company.entity | Provider company profiles |
| `likedpost` | likedpost.controller, likedpost.service, likedpost.entity | Engagement |
| `viewedpost` | viewedpost.service, viewedpost.entity | No controller — called from PostService |
| `admin` | admin.controller, admin.service, admin.guard | Phone-list guard, post approval |
| `events` | events.gateway, events.module | Socket.io rooms: admin, provider:{userId} |
| `privacy` / `terms` / `account-deletion` | CRUD modules | HTML page render endpoints |

### All API endpoints

Base URL: `https://zuuchmap.com/engine`  
All protected routes require `Authorization: Bearer {JWT}`.

**Auth**
```
POST /auth/otp/send          body: { phone_number }
POST /auth/otp/verify        body: { phone_number, code } or biometric payload
```

**User**
```
POST   /user/check                   body: { phone_number }
POST   /user/type                    body: { type: PROVIDER|CUSTOMER }
POST   /user/otp/enroll-biometric    JWT
GET    /user/profile                 JWT → own profile
GET    /user/profile/posts           JWT → own posts
PUT    /user/push-token              JWT, body: { token }
GET    /user                         list all users
GET    /user/:id
PATCH  /user/:id                     multipart/form-data, JWT
DELETE /user/account                 JWT → delete own account
DELETE /user/:id
```

**Posts**
```
POST   /posts                        multipart, max 10 images, JWT
GET    /posts                        ?category&approval_status&status&page&limit
GET    /posts/map                    map-optimized list
GET    /posts/mine                   JWT
GET    /posts/:id                    ?increment_view=true
PUT    /posts/:id/views              JWT
PATCH  /posts/:id                    multipart, JWT
DELETE /posts/:id                    JWT
```

**Category schemas**
```
GET    /posts/categories/all
GET    /posts/categories/:key
POST   /posts/categories             JWT
PATCH  /posts/categories/:key        JWT
```

**Likes**
```
POST   /like                         JWT, body: { post_id, post_type }
DELETE /like/:post_type/:post_id     JWT
GET    /like/check/:post_type/:post_id
GET    /like                         JWT, ?page&limit
GET    /like/ids                     JWT, ?post_type
GET    /like/stats/:post_type/:post_id
```

**Company**
```
POST   /company                      multipart logo
GET    /company
GET    /company/:id
PATCH  /company/:id                  multipart, JWT
DELETE /company/:id
```

**Admin** — all require JWT + AdminGuard (phone list)
```
GET  /admin/posts/pending            ?category
PUT  /admin/posts/:id/approve
PUT  /admin/posts/:id/reject         body: { reason }
GET  /admin/stats
```

**Privacy / Terms / Account-deletion** — identical shape
```
POST   /privacy (or /terms or /account-deletion)
GET    /privacy
GET    /privacy/page                 renders HTML
GET    /privacy/:id
PATCH  /privacy/:id
DELETE /privacy/:id
```

### Entities

**User**
```
id (UUID PK), type (PROVIDER|CUSTOMER), phone_number, parent_name, given_name,
email, address, biometric, device_info (JSONB), is_verified,
profile_picture, push_token, date_created, date_updated
Relations: company (M→1), posts (1→M), likedposts (1→M), viewedposts (1→M)
```

**Post**
```
id, category, firstcategory, secondcategory,
title, details, province, district, address, latitude, longitude, location,
price_amount (decimal), price_unit (PriceUnit enum),
contact_phone, contact_email, available_from, available_until,
website, operating_hours,
images (JSONB array of strings), attributes (JSONB object),
views, status (ACTIVE|PAUSED|EXPIRED|RENTED),
approval_status (PENDING|APPROVED|REJECTED), rejection_reason,
date_created, date_updated
Indexes: category, status, approval_status, [category+approval_status],
         [approval_status+date_created], user
Relations: user (M→1, CASCADE delete)
```

**Company**
```
id (UUID), name, description, logo, website, address,
phone_number, email, registration_number, tax_id,
is_verified, date_created, date_updated
Relations: users (1→M)
```

**Likedpost**
```
id, user_id (FK), post_type (string), post_id, date_liked
Unique: [user_id, post_type, post_id]
```

**Viewedpost**
```
id, user_id (FK), post_type (string), post_id, date_viewed
Unique: [user_id, post_type, post_id]
```

**CategorySchema**
```
id, key (unique), label, icon, color,
subcategories (JSONB: [{value, display}]),
fields (JSONB: [{key, label, type, options, required, placeholder}]),
active, sort_order, created_at
Field types: text | textarea | number | select | date | phone
```

### Enums (all in `src/enums/`)
```
UserType:       PROVIDER, CUSTOMER
ApprovalStatus: PENDING, APPROVED, REJECTED
Status:         ACTIVE, PAUSED, EXPIRED, RENTED
PriceUnit:      HOUR, DAY, WEEK, MONTH, PROJECT, UNIT
Province:       22 Mongolian provinces (ULAANBAATAR included)
District:       9 UB districts (Bayanzurkh, Songinokhairkhan, etc.)
```

### ⚠ Admin phone list — duplicated

Hardcoded in **two** places. Change both or they diverge:
1. `zuuchmap_engine/src/admin/admin.guard.ts` — `ADMIN_PHONES` array (server auth)
2. `zuuchmap_web/src/lib/auth.js` — `ADMIN_PHONES` array (client routing)

---

## Web

**Entry:** `zuuchmap_web/src/main.jsx` → `App.jsx`  
**Path alias:** `@` → `src/`  
**HTTP client:** `src/lib/api.js` — Axios, auto-attaches JWT, redirects to `/login` on 401

### Routes

| Path | Component | Role |
|---|---|---|
| `/login` | LoginPage | Public |
| `/verify` | VerifyPage | Public |
| `/onboarding` | RoleSelectPage | Public |
| `/posts/:id` | PostDetail | Public |
| `/privacy` | PolicyPage | Public |
| `/account-deletion` | AccountDeletion | Public |
| `/admin` | AdminDashboard | Admin |
| `/admin/posts` | AdminPosts | Admin |
| `/admin/posts/:id` | AdminPostDetail | Admin |
| `/admin/users` | AdminUsers | Admin |
| `/provider` | ProviderDashboard | Provider |
| `/provider/posts` | ProviderPosts | Provider |
| `/provider/posts/new` | ProviderPostForm | Provider |
| `/provider/posts/:id/edit` | ProviderPostForm | Provider |
| `/provider/profile` | ProviderProfile | Provider |
| `/provider/company` | ProviderCompany | Provider |
| `/customer` | CustomerDashboard | Customer |
| `/customer/browse` | CustomerBrowse | Customer |
| `/customer/map` | CustomerMap | Customer |
| `/customer/saved` | CustomerSaved | Customer |
| `/customer/profile` | CustomerProfile | Customer |

**Auth/routing logic:** `RootRedirect()` in App.jsx checks `useAuthStore` → `isAdmin`, `user.type`, redirects to appropriate dashboard. No per-route guard component; relies on global Zustand state.

### State
```
useAuthStore  (store.js): token, user, isAdmin, hydrate(), login(), logout()
useThemeStore (store.js): theme, toggleTheme()
```
Everything else is TanStack React Query (`useQuery` / `useMutation`).

### Real-time (`hooks/useRealtimeSync.js`)
Joins Socket.io rooms (`admin`, `provider:{userId}`).  
Events: `post.created`, `post.approved`, `post.rejected`, `stats.updated` → invalidate React Query caches.

### i18n
`src/i18n/` — `en.js`, `mn.js`, `zh.js`, `ru.js`, `es.js`. Same key structure as the app.

### Key libraries
Framer Motion (page transitions), Leaflet + React-Leaflet (map), Recharts (dashboard charts), Sonner (toasts), Lucide React (icons).

---

## App

**Entry:** `zuuchmap_app/App.js` → single `<Stack.Navigator>` with all 28 screens  
**Package manager:** Yarn (not npm)

### Navigation structure

```
Stack.Navigator
├── Auth
│   ├── PhoneNumber
│   ├── OtpVerification
│   └── BiometricAuth
├── Onboarding
│   └── UserRoleSelection
├── Provider (9 screens)
│   ├── ProviderDashboard
│   ├── ProviderPostCreate
│   ├── ProviderPostEdit        ← merge with Create into one screen
│   ├── ProviderPostList
│   ├── ProviderLocationSelection
│   ├── ProviderProfile
│   ├── ProviderEditProfile
│   ├── ProviderCompany
│   └── ProviderCompanyCreate
├── Customer (6 screens)
│   ├── CustomerDashboard
│   ├── CustomerPostList
│   ├── CustomerLikeList
│   ├── CustomerMapView
│   ├── CustomerProfile
│   └── CustomerEditProfile
├── Admin (3 screens)
│   ├── AdminDashboard
│   ├── AdminPostList
│   └── AdminPostDetail
└── Shared (5 screens)
    ├── PostDetailScreen
    ├── CategorySelectScreen
    ├── SubcategorySelectScreen
    ├── PrivacyPolicyScreen
    └── AccountDeletionScreen
```

**Initial route logic** (`src/utils/navigationUtils.js` → `getInitialRoute()`):
1. Token + userType → `getDashboardScreen(userType)`
2. Token + no userType → `UserRoleSelection`
3. No token + stored user + biometric enrolled → `BiometricAuth`
4. Else → `PhoneNumber`

### Key config files

**`src/config/api.config.js`**
```
API_BASE_URL, ENDPOINTS (all paths by role), STORAGE_KEYS,
UPLOAD_PATHS, CACHE_DURATIONS (MAP_POSTS:15min, POST_LIST:10min, SCHEMAS:1h)
```

**`src/config/app.config.js`**
```
POST_TYPES (8), POST_TYPES_WITH_STATUS, POST_TYPES_WITHOUT_STATUS,
USER_TYPES, DEFAULT_LOCATION, IMAGE (quality/size), VALIDATION patterns,
TIMEOUTS (view increment: 2s, OTP resend: 60s)
MESSAGES.COMING_SOON — defined but unused
```

**`src/design/theme.js`** — single source of truth for all visual tokens:
```
colors, spacing (xxs→xxxxl + semantic), radius (semantic: button:12, card:16, modal:20),
typography (sizes + weights + styles), shadows (none/xs/small/medium/large/xl/primary/success/dark),
animations (duration: fast:150, normal:250, slow:350), interactions (activeOpacity),
dimensions (statusBar, header, bottomTab), globalStyles, safeAreaHelpers
```

### Post types (canonical list — matches engine + app + web)
```
vehiclerent     machineryrent    factory       jobvacancy
toolrent        materialstore    construction  sos
```

### i18n (`src/i18n/locales/`)
`en.js`, `mn.js`, `zh.js`, `ru.js`, `es.js`  
Sections: `nav, auth, common, form, filter, status, errors, posts, admin, category, provider, customer, profile, company, settings, onboarding, attrs, upload, priceUnit, map, privacy, accountDeletion, subcategory`

**`subcategory` section** — present in mn.js and (as of recent fix) zh/ru/es. ~100 entries for construction category names.

### Services (`src/services/api/`)
Each wraps `apiClient.js` (Axios instance with JWT interceptor):
`authService`, `userService`, `postService`, `likeService`, `companyService`, `categoryService`  
Plus `authHelpers.js` for token/user storage.

### Components (`src/components/`)
`ActionButton, BaseModal, BottomSheetModal, CategoryBadge, CategoryForms, ContactSection, CustomSafeAreaView, DatePickerField, DialogModal, DynamicForm, EmptyState, ErrorModal, ErrorModalManager, FadeSlideIn, FormField, ImageUploadSection, IOSPickerModal, LikeButton, LocationRow, LocationSection, MapFilterModal, PickerButton, PrimaryButton, ProfileBadge, ProfileSection, ScreenError, ScreenHeader, ScreenLayout, ScreenLoading, SearchInput, SettingsSection, SkeletonItem, StatusBadge, StatusSection, TextInput`

**⚠ Known bug — BottomSheetModal stale closure:** `PanResponder` captures `onClose` at mount time. If parent re-renders with new `onClose`, pan responder uses stale reference. Fix: mirror `onClose` into a ref inside the component.

---

## Cross-cutting concerns

### Adding a new post category

1. **Engine** — insert a `CategorySchema` record via `POST /posts/categories` with key, label, icon, color, subcategories, fields
2. **App** — add the key to `POST_TYPES` in `src/config/app.config.js`; add to the appropriate `WITH_STATUS`/`WITHOUT_STATUS` array
3. **Web** — add to category filter options in `CustomerBrowse.jsx` and `AdminPosts.jsx` if hard-filtered
4. **i18n** — add the key to `category` section in all 5 locale files across both app and web

### Adding a new language

1. **App** — create `src/i18n/locales/{code}.js` mirroring `en.js` structure; register in `src/i18n/index.js`
2. **Web** — create `src/i18n/{code}.js`; register in the web i18n config
3. **App settings** — add to `settings.languages` in all existing locale files

### Adding a new screen (app)

1. Create `src/screens/{role}/ScreenName.jsx`
2. Register in `App.js` `<Stack.Navigator>`
3. Add navigation call from parent screen
4. Add to translation files if screen has new string keys

### Adding a new API endpoint

1. Add method to the relevant service in `src/services/api/{name}Service.js` (app) and `src/lib/api.js` (web)
2. Add endpoint constant to `ENDPOINTS` in `src/config/api.config.js` (app)
3. Add method + route to the relevant NestJS controller + service (engine)

---

## Known issues to fix (prioritized)

| Priority | Issue | File(s) |
|---|---|---|
| 🔴 Critical | `synchronize: true` — needs migration | `zuuchmap_engine/src/app.module.ts` |
| 🔴 Critical | OTP not actually sent via SMS | `zuuchmap_engine/src/auth/auth.service.ts` |
| 🔴 Critical | Push notifications never sent | `zuuchmap_engine/src/utils/pushNotification.ts` (unused) |
| 🟠 High | Admin phone list duplicated in 2 places | `engine/admin.guard.ts`, `web/lib/auth.js` |
| 🟠 High | Web admin check is client-side only | `zuuchmap_web/src/lib/auth.js` + store |
| 🟠 High | Stale closure in BottomSheetModal panResponder | `zuuchmap_app/src/components/BottomSheetModal.jsx` |
| 🟠 High | Images stored on disk (not S3) | `zuuchmap_engine/src/utils/uploader.ts` |
| 🟡 Medium | ProviderPostCreate + ProviderPostEdit are duplicates | `zuuchmap_app/src/screens/provider/Provider*` |
| 🟡 Medium | Help/Support + Notifications screens don't exist | `src/screens/` (missing) |
| 🟡 Medium | Terms screen missing from app and web | `src/screens/shared/` (missing) |
| 🟡 Medium | `system` theme option unimplemented | `src/hooks/useAppTheme.js` |
| 🟡 Medium | No rate limit on OTP endpoint | `engine/src/auth/auth.controller.ts` |
| 🟢 Low | Dead `categoryBreadcrumb` style in PostDetailScreen | `PostDetailScreen.jsx` createStyles |
| 🟢 Low | Dead `colors` import in BottomSheetModal | `BottomSheetModal.jsx` line 6 |
| 🟢 Low | `MESSAGES.COMING_SOON` defined but unused | `app.config.js` |
| 🟢 Low | `UpdateLikedpostDto` / `UpdateViewedpostDto` unused | `likedpost/dto/`, `viewedpost/dto/` |
