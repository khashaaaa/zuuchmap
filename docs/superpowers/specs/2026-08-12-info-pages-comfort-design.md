# Info pages UI comfort — design

Date: 2026-08-12
Scope: `zuuchmap_web` only — `/privacy`, `/terms`, `/help`, `/account-deletion`

## Problem

`/privacy` and `/account-deletion` were recently pulled out of the authenticated
`AppLayout` (sidebar + header) to satisfy Play Store's requirement that they be
reachable without login. That left them with zero navigation chrome — no back
button, no icon, no way to leave the page except the browser's own back
button. `/terms` and `/help` are still inside `AppLayout`, so the four pages
now look and behave inconsistently with each other. None of the four are
linked from anywhere in the app UI — they're only reachable by typing the URL
directly.

## Design

### 1. Extend `PageHeader`, don't duplicate it

`src/components/PageHeader.jsx` is already used by all four pages (plus
several authenticated admin/provider/customer pages). Add two optional props:

- `icon` — a Lucide icon component, rendered next to the title.
- `onBack` — a click handler. When present, renders a small back row above
  the title: `ArrowLeft` (size 15) + `t('common.back')`, styled
  `text-sm text-muted hover:text-text transition-colors` — the same visual
  treatment `PostDetail.jsx` already uses for its own back button, so this is
  the pattern's second use, not a new one.

Pages that don't pass `icon`/`onBack` (all existing authenticated-page
callers) render exactly as before — fully backward compatible.

### 2. Back button target: explicit, not history-based

Each of the four pages passes `onBack={() => navigate('/login')}` —
**not** `navigate(-1)`. These pages must work as cold deep links (a Play
Store reviewer, a search result, a pasted URL) where browser history may be
empty; `navigate(-1)` would silently no-op in that case. `/login` is the
stable "home" for a logged-out visitor. (`PostDetail.jsx`'s existing back
button keeps using `navigate(-1)` — it's always reached via in-app
navigation, so history is reliably present there.)

### 3. Per-page icon

| Page | Icon |
|---|---|
| Privacy (`PolicyPage.jsx`) | `Shield` |
| Terms (`TermsPage.jsx`) | `FileText` |
| Help (`HelpPage.jsx`) | `HelpCircle` |
| Account deletion (`AccountDeletion.jsx`) | `Trash2` (already imported/used on the delete button) |

### 4. All four become self-contained standalone pages

Each of the four page components wraps its own root in
`min-h-screen bg-background p-3 md:p-6` (rather than `App.jsx` supplying that
wrapper per-route, as it currently does for `/privacy` and
`/account-deletion`). `App.jsx` routes for all four move out of the
`ProtectedRoute`/`AppLayout` block into the public routes section — `/terms`
and `/help` stop requiring login, matching `/privacy` and `/account-deletion`.

### 5. Discoverability: login footer

`LoginPage.jsx` gets a small text-link footer below the form: **Privacy ·
Terms · Help**, each a plain `<Link>` to its route. `Account-deletion` is
deliberately excluded from this footer — it's not a marketing-style link;
it stays reachable via the profile screen and its own direct URL.

### 6. Spacing polish

Content cards inside these four pages go from `p-6` to `p-6 md:p-8`. No
other structural/visual changes — this is a comfort pass, not a redesign.

## Out of scope

- No changes to `zuuchmap_app` (mobile) — this is web-only.
- No changes to page copy/translations beyond what already exists (only new
  strings: nothing — `common.back` already exists in all 4 locales).
- No new footer links beyond Privacy/Terms/Help on the login page.

## Addendum: sidebar/header height, and app-wide soft shadows

Added after initial approval, same session:

### Sidebar brand block vs. header height

`AppSidebar.jsx`'s brand block (`px-4 py-4`, title + subtitle) was ~80px tall
against `AppHeader.jsx`'s fixed `h-14` (56px) — visibly jagged where they meet.
Fixed by making the brand block `h-14` too (`flex flex-col justify-center`
instead of `py-4`), so both align exactly.

### Header action container heights

`Bell` and the theme toggle already shared `min-w-[44px] min-h-[44px]`. The
language switcher only had `px-3 py-1.5` with no min-height, so it rendered
shorter. Added `min-h-[44px]` to match.

### App-wide border softening + card shadows

Scope: all of `zuuchmap_web` (not the mobile app). `border-border` appeared
94 times across 36 files at full opacity — the "hard/sharp" look. 6 of those
(table-row dividers) were already softened to `border-border/50` by a prior
author; that established value was adopted as the standard rather than
inventing a new one.

- Added `--shadow-card` to `index.css`, theme-aware (`@theme` for dark,
  `html[data-theme="light"]` override) — a shadow tuned for light mode is
  invisible against the dark palette's `#1F2124` surface, so dark mode uses a
  more opaque shadow.
- Softened all bare `border-border` → `border-border/50` app-wide (skipping
  the 6 already-correct spots).
- Added `shadow-card` to genuine "card" containers (the
  `bg-surface border border-border rounded-card` pattern, ~26 occurrences)
  — skipped `Modal.jsx` and `AppHeader.jsx`'s two dropdowns, which already
  use `shadow-xl`/`shadow-lg` and don't need a second shadow.
  `CollapsibleSection.jsx`'s "boxed" variant got the same treatment; its
  "bare" variant (nests inside an existing card) deliberately did not.
  `CustomerMap.jsx`'s map container and post-list cards got it too (matching
  `PostCard.jsx`, which was already in the bulk set).
- `AppSidebar.jsx` (aside + brand block) and `AppHeader.jsx` also got
  `shadow-card` on top of their softened borders, since they're the two most
  persistent "chrome" elements in the app.
- Did not touch semantic-color borders (`border-danger/30`,
  `border-success/20`, etc.) or focus-state borders — only the neutral
  `border-border` token was in scope.

### Verified

- `npm run build` succeeds, no console errors on any of the 4 info pages.
- Screenshots taken of `/login` (new footer), `/privacy`, `/help` (back
  button, icon, softened+shadowed cards) and an authenticated dashboard via
  a scripted login (sidebar brand block now aligns exactly with the header).
- Found and flagged (not fixed, out of scope) a pre-existing bug:
  `LoginPage.jsx`'s dev-mode OTP hint reads `res.data?.code`, but the axios
  client's response interceptor doesn't unwrap `.data`, so it should be
  `res.data?.data?.code`. The hint has silently never displayed in dev.
