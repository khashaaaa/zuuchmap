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
