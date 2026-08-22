# Category Field Schema Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 31 all-optional category attribute fields with 42 required core fields plus 24 optional details, so every post carries the information the other side needs to act on.

**Architecture:** Capability first, cutover last. Tasks 1–11 add new field types, filter branches, validation code, client renderers and admin controls while **no category uses any of them** — every one is inert and independently shippable. Task 12 is the single cutover migration that flips all 13 schemas at once, at which point every capability it depends on already exists in both clients. Reversing this order breaks posting: providers would face required fields their app cannot render.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL (jsonb + GIN), React 19 + Vite + Tailwind 4, React Native 0.81 + Expo 54, Jest, i18next.

**Design:** the `## Design` section below — read it before Task 1.

## Global Constraints

- **No git commands.** This project's CLAUDE.md reserves all commits to the user. Every task ends with a **verification** step instead of a commit step. Report what changed and stop; do not stage, commit, or branch.
- **npm only.** Never yarn.
- **⚠ `migrationsRun: true`.** The dev server runs pending migrations on every watch restart. Never leave a half-written migration file on disk while `npm run dev` is running. Task 12 says this again where it matters.
- **`fields` is a `jsonb` column** — new `FieldDef` properties need no column migration, only the interface and the data.
- **No hardcoded category behavior in clients.** Everything derives from `CategorySchema`. Adding a vertical must stay an admin-UI operation.
- **Engine tests:** `cd zuuchmap_engine && npx jest`
- **Web build:** `cd zuuchmap_web && npm run build`
- **Theme rules (app):** get `{ colors, styles }` from `useAppTheme()`; spread a typography role (`...typography.styles.label`), never set `fontSize`+`fontFamily` by hand; spread `...colors.elevation.sm` FIRST in a style object.
- **Field key vocabulary is fixed by the Design section.** `experience_years`, `license_no`, `capacity`, `with_operator`, `delivery_available`, `operating_hours`, `coverage`, `response_time_min`, `moto_hours`. Never introduce a synonym.

---

## Design

> Merged from the former separate spec file. The plan argues from this
> design; both travel together so there is one document per piece of work.

#### Goal

Every post should carry the information the other side needs to act — enough for a
customer to decide without a phone call, and no more than a provider will actually
fill in. Today the schema fails both halves: nothing is required, the decisive
questions are missing, and half the answers are trapped in free text where they
cannot be filtered or compared.

### Problems in the current schema

Evidence from `post/category.service.ts` (13 categories, 31 attribute fields):

1. **`required: true` appears zero times.** A crane rental is postable with a title
   and one photo. Nothing forces the data that makes a listing usable.
2. **Structured values stored as text**, so they cannot be filtered or sorted:
   `salary_range` (`"800,000 - 1,200,000₮"`), `manufactured_date` (`"2020"`),
   `mileage` (`"120,000 км"`), `capacity` (`"100 ш/өдөр"`), `operating_hours`
   (`"24 цаг"` in one category, `"09:00 - 18:00"` in another).
3. **The decisive question is missing.** `machineryrent` has no capacity and no
   "operator included" — the first two questions any renter asks. `jobvacancy` has no
   experience requirement. `sos` — an emergency category — has no response time and no
   coverage area.
4. **`FieldDef.type` cannot express what is needed**: `text | textarea | number |
   select | date | phone`. No boolean, no multiselect.
5. **`FieldDef.unit` is dead.** Declared on the interface, set once
   (`capacity_tons: 'т'`), rendered by no client.
6. **`materialstore` subcategories are the wrong axis** — `individual / wholesale /
   retail` describes the *seller*, not the goods. The actual product lives in a
   free-text `main_products` field, so browsing construction materials cannot be
   narrowed to cement or rebar.
7. **The same concept uses different keys** — credentials are `license_info` in
   `designservice` and `certifications` in `miningsupport`.

### Design principles

- **Core vs details.** Each category gets 2–5 **core** fields (required, rendered
  upfront) and 0–3 **detail** fields (optional, behind a collapsible). A provider in a
  hurry answers the core set and posts.
- **One vocabulary.** A concept has one key across all categories.
  `experience_years` means the same everywhere; credentials are always `license_no`.
- **Never duplicate a Post column.** `title`, `details`, `province`, `district`,
  `address`, `price_amount`, `price_unit`, `contact_phone`, `available_from/until`,
  `images`, `website` are columns. No attribute may restate them — this is why there is
  no "deadline" field on `jobvacancy` (`available_until` covers it) and no location
  field anywhere.
- **Every field earns its place.** If the answer would not change a customer's
  decision to call, it does not ship.
- **Numbers over prose.** The filter engine at `post.service.ts:245-251` already does
  `_min`/`_max` range filtering on any numeric attribute. Typing a field as `number`
  turns on range filtering with no backend work.

### Schema changes

#### `FieldDef` (`post/entities/category-schema.entity.ts`)

```ts
export interface FieldDef {
  key: string;
  label: string;
  labels?: Record<string, string>;
  type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'phone'
      | 'boolean'      // NEW — yes/no switch
      | 'multiselect'; // NEW — zero or more of `options`
  options?: string[];
  required?: boolean;
  group?: 'core' | 'details'; // NEW — omitted means 'core'
  placeholder?: string;
  placeholders?: Record<string, string>; // NEW — localized, mirrors `labels`
  filterable?: boolean;
  unit?: string;  // now actually rendered
}
```

`fields` is a `jsonb` column, so none of this needs a column migration — only the
interface and the seed data.

#### Storage

- `boolean` stores a real JSON boolean. Filter uses `attributes @> '{"key":true}'`
  (GIN-indexed, same path as `select`).
- `multiselect` stores a JSON array of option strings. Filter uses
  `attributes->'key' ? :value` for "has this value".

Both need a branch in the `hasAttrs` block of `post.service.ts`.

### Shared field library

Replaces the ad-hoc `rentalFields` / `hoursField` helpers. Each builder returns a
`FieldDef` with all four `labels` filled.

| Builder | Key(s) | Type | Notes |
|---|---|---|---|
| `identity(pick)` | `manufacturer`, `model`, `year` | text, text, number | returns the subset named in `pick`, each already grouped; `year` becomes numeric — range-filterable |
| `capacity(label, unit)` | `capacity` | number, filterable | unit varies per category (`т`, `м³`, `хүн`) |
| `condition()` | `condition` | select, filterable | `NEW EXCELLENT GOOD FAIR NEEDS_REPAIR` |
| `withOperator(label)` | `with_operator` | boolean, filterable | "Жолоочтой" / "Операторчтой" per category |
| `delivery()` | `delivery_available` | boolean, filterable | |
| `experience()` | `experience_years` | number, filterable | |
| `licenseNo()` | `license_no` | text | replaces `license_info` **and** `certifications` |
| `hours()` | `operating_hours` | **select**, filterable | see below |
| `coverage()` | `coverage` | select, filterable | `CITY PROVINCE NATIONWIDE` |
| `responseTime()` | `response_time_min` | number, filterable, unit `мин` | |

#### `operating_hours` becomes a select

This is the field that prompted the review — a provider could not tell whether it
wanted one digit or a range, because different categories seeded different formats.
A select removes the ambiguity completely and makes "open now" filterable:

| Value | mn | en |
|---|---|---|
| `H24` | 24 цаг | 24 hours |
| `WEEKDAY_DAY` | Ажлын өдөр 09:00–18:00 | Weekdays 09:00–18:00 |
| `DAILY_DAY` | Өдөр бүр 09:00–18:00 | Daily 09:00–18:00 |
| `BY_CALL` | Дуудлагаар | By appointment |

### Per-category fields

**Core fields are required.** Detail fields are optional.

#### vehiclerent — Тээврийн хэрэгсэл
| Group | Field | Type |
|---|---|---|
| core | `manufacturer` `model` `year` | text text number |
| core | `with_operator` — Жолоочтой | boolean |
| details | `fuel_type` — `PETROL DIESEL GAS ELECTRIC` | select |
| details | `seats` — Суудлын тоо | number |

*Removed:* `imported_date` — import year does not change a rental decision; it mattered
only for resale, which is `usedequipment`'s job.

#### machineryrent — Машин техник
| Group | Field | Type |
|---|---|---|
| core | `manufacturer` `model` `year` | text text number |
| core | `capacity` — Даац / хүчин чадал (т) | number, unit `т` |
| core | `with_operator` — Операторчтой | boolean |
| details | `delivery_available` · `min_rental_days` | boolean · number |
| details | `min_moto_hours_per_day` — Өдрийн доод мото цаг | number |

*Added:* `capacity` and `with_operator` are the two questions every renter asks first
and neither existed.

*Added:* `min_moto_hours_per_day`. Engine-hour pricing needs a floor — a committed
machine cannot be re-rented, so without a minimum a customer can hold it on site for a
week and log four hours. It is also what lets a customer compute what a day actually
costs from a мото цаг rate. Together with `min_rental_days` and `delivery_available`
the details group is now purely commercial terms, which is a coherent thing to put
behind one collapsible.

*Removed:* `imported_date`. *Removed:* `condition` — on a rental the owner maintains the
machine and every provider will answer EXCELLENT, so the field costs a question and
returns no signal. It stays core on `usedequipment`, where you are buying the wear and
it is decisive. The same argument arguably applies to `toolrent.condition`; left in
place there for now since hand and power tools genuinely vary and that group is not
crowded.

#### toolrent — Багаж хэрэгсэл
| Group | Field | Type |
|---|---|---|
| core | `manufacturer` | text |
| core | `quantity_available` — Боломжит тоо ширхэг | number |
| details | `model` · `condition` · `delivery_available` | text · select · boolean |

*Rationale:* tools are low-value and rented in bulk; count matters more than model.
Demoting `model` to details is the friction cut for this category.

#### materialstore — Барилгын материал
**Subcategories replaced** — the current `individual / wholesale / retail` becomes a
field, and subcategory becomes the material:

`cement` Цемент · `aggregate` Хайрга, элс · `rebar` Арматур, металл · `timber` Мод
materials · `insulation` Дулаалга · `brick_block` Тоосго, блок · `roofing` Дээврийн
материал · `finishing` Заслын материал · `plumbing_electrical` Сантехник, цахилгаан ·
`other` Бусад

| Group | Field | Type |
|---|---|---|
| core | `sale_type` — `WHOLESALE RETAIL BOTH` | select, filterable |
| core | `delivery_available` | boolean |
| core | `operating_hours` | select |
| details | `min_order` — Хамгийн бага захиалга | text |

*Removed:* `main_products` — the new subcategories carry it, structured and filterable.

#### construction — Барилгын үйлчилгээ
| Group | Field | Type |
|---|---|---|
| core | `experience_years` · `team_size` | number · number |
| core | `with_materials` — Материалтай эсэх | boolean, filterable |
| details | `license_no` · `warranty_months` | text · number |

*Added:* `with_materials` — whether the quoted price includes materials is the single
biggest source of misunderstanding in Mongolian construction contracting.

#### jobvacancy — Ажлын байр
| Group | Field | Type |
|---|---|---|
| core | `employment_type` — unchanged options | select, filterable |
| core | `salary_min` · `salary_max` | number · number, filterable |
| core | `experience_years` | number, filterable |
| core | `accommodation_provided` — Байр, хоолтой | boolean, filterable |
| details | `positions` — Ажлын байрны тоо | number |

*Changed:* `salary_range` text → `salary_min`/`salary_max` numbers. Salary is what job
seekers sort and filter by; as text it supports neither. *Added:*
`accommodation_provided`, decisive for site and mine work. *Not added:* a deadline field
— `available_until` already expires the post.

#### factory — Үйлдвэр
| Group | Field | Type |
|---|---|---|
| core | `capacity` — Өдрийн хүчин чадал | number, unit `нэгж/өдөр` |
| core | `operating_hours` | select |
| core | `delivery_available` | boolean |
| details | `min_order` · `license_no` | text · text |

#### sos — SOS Үйлчилгээ
| Group | Field | Type |
|---|---|---|
| core | `response_time_min` — Хүрэлцэн ирэх хугацаа | number, unit `мин`, filterable |
| core | `coverage` | select, filterable |
| core | `operating_hours` | select |

*Rationale:* this category is `emphasized` and priced but carried one field. A stranded
driver is asking exactly two things — how fast, and do you come out this far. No detail
group; three fields is the whole listing.

#### usedequipment — Худалдах техник
| Group | Field | Type |
|---|---|---|
| core | `manufacturer` `model` `year` | text text number |
| core | `condition` | select, filterable |
| details | `mileage_km` · `moto_hours` · `negotiable` | number · number · boolean |

*Changed:* `mileage` text → `mileage_km` number (range-filterable).
*Added:* `moto_hours` — Мото цаг, the hour-meter reading. Engine hours price used
machinery more than the odometer does, and for machinery with no odometer at all it is
the only wear measure there is.

#### transport — Тээвэр, ачаа
| Group | Field | Type |
|---|---|---|
| core | `capacity` — Даац | number, filterable, unit `т` |
| core | `coverage` | select, filterable |
| details | `loading_included` — Ачилт багтсан | boolean |
| details | `vehicle_count` | number |

*Renamed:* `capacity_tons` → `capacity` with `unit: 'т'`, so tonnage filters share one
key with machinery. *Removed:* `service_route` free text (`"УБ - Дархан"`) —
unfilterable and endlessly variable; `coverage` answers the same question in a
comparable form.

#### designservice — Зураг төсөл, инженеринг
| Group | Field | Type |
|---|---|---|
| core | `experience_years` | number, filterable |
| core | `license_no` | text |
| core | `delivery_days` — Гүйцэтгэх хугацаа (хоног) | number, filterable |
| details | `project_count` — Хийсэн төслийн тоо | number |

*Renamed:* `license_info` → `license_no`.

#### miningsupport — Уул уурхайн үйлчилгээ
| Group | Field | Type |
|---|---|---|
| core | `experience_years` | number, filterable |
| core | `license_no` | text |
| core | `crew_size` — Багийн бүрэлдэхүүн | number |
| details | `coverage` · `equipment_owned` | select · boolean |

*Renamed:* `certifications` → `license_no`. Blasting and earthworks are licensed
activities; one key for credentials across all three service categories.

#### winterservice — Өвлийн үйлчилгээ
| Group | Field | Type |
|---|---|---|
| core | `coverage` | select, filterable |
| core | `operating_hours` | select |
| details | `response_time_min` · `equipment_owned` | number · boolean |

*Removed:* `service_area` free text — superseded by `coverage`.

#### Totals

| | Before | After |
|---|---|---|
| Attribute fields | 31, all optional | 42 core (required) + 24 details |
| Categories with 0 required fields | 13 | 0 |
| Free-text holding structured data | 6 | 0 |

`filterable` is set per field in the tables above rather than counted here. The rule:
mark a field filterable only if a customer would plausibly narrow a browse list by it.
A category should expose at most four browse filters — more controls than that is its
own kind of friction, and `machineryrent` is the one to watch, since manufacturer,
model, year, capacity, condition, delivery and operator are all defensible. Pick four.

### Price units: add `MOTO_HOUR`

`PRICE_UNITS` today is `HOUR DAY WEEK MONTH PROJECT UNIT PIECE SQM TRIP TOTAL`, where
`HOUR` renders as *цагаар* — a clock hour.

Heavy equipment in Mongolia is not billed by the clock hour. It is billed by **мото цаг**
(engine hour), read off the machine's hour meter, so that idle time on site is not
charged at working rates. A machine present for ten clock hours may log six мото цаг.
The two are different numbers and different money, and the schema currently offers no
way to say which one a price means.

**Add `MOTO_HOUR`** — *мото цагаар* (mn) / *per engine hour* (en) — and set it as
`default_price_unit` for `machineryrent` and `miningsupport`. `HOUR` stays for services
genuinely billed by clock time (`sos`, `construction` labour). Providers who quote a
daily rate keep using `DAY`; the point is that those who quote by мото цаг can now say
so unambiguously.

This also aligns the vocabulary with `usedequipment.moto_hours` above — the same unit
measuring wear rather than price.

#### Two defects found while checking this

1. **`PRICE_UNITS` is duplicated**, in `zuuchmap_app/src/config/app.config.js:1` and
   `zuuchmap_web/src/lib/utils.js:6`, plus four i18n files. Adding a unit means six
   coordinated edits and nothing catches a miss.
2. **There is no server-side `PriceUnit` enum.** `src/enums/` holds only
   `bookingstatus`, `status`, `usertype`; `price_unit` is an unvalidated `varchar`, so a
   client typo persists silently. CLAUDE.md lists `PriceUnit` under Enums — that line is
   wrong and should be corrected.

Fix both as part of this work: add `src/enums/priceunit.ts` as the single source of
truth, validate `price_unit` against it in the post DTO, and have both clients import
their list from the API's category endpoint or keep the constant with a comment naming
the enum as canonical. Correct the CLAUDE.md Enums line.

### Migration

Existing production post attributes are disposable where they conflict (confirmed by
the user), so no value-parsing is required.

One migration, `<timestamp>-CategoryFieldsRedesign.ts`:

1. Replace `fields` on all 13 category schemas with the new definitions.
2. Replace `materialstore.subcategories` with the material list; move any post whose
   subcategory was `individual|wholesale|retail` to subcategory `other` and set
   `sale_type` from the old value (`wholesale → WHOLESALE`, `retail → RETAIL`,
   `individual → RETAIL`). This one mapping is cheap and preserves real signal.
3. Prune every post `attributes` key not present in its category's new field list —
   a single `jsonb` update per category.
4. `down()` restores the previous `fields` and subcategory arrays. Pruned post
   attributes are not recoverable; the migration comment must say so.

`seedCategories()` is also updated so a fresh database gets the new schema directly.
It early-returns when the table is non-empty, so it cannot be relied on for the upgrade
— hence the migration.

⚠ `migrationsRun: true` — the dev server runs pending migrations on every watch restart.
Do not leave this file half-written on disk while `npm run dev` is running.

### Client work

#### Engine
- `FieldDef` interface: add `boolean`, `multiselect`, `group`, `placeholders`.
- `post.service.ts` `hasAttrs` block: add a `boolean` branch (`@>` containment) and a
  `multiselect` branch (`?` operator).
- `attributeFieldTypes()` already reads types from the schema — extend its map usage.
- Server-side validation: reject a create/update whose category has a `required` field
  missing from `attributes`. Enforced on create and edit only; existing approved posts
  are untouched until their provider edits them.

#### App (`zuuchmap_app`)
- `DynamicForm.jsx`: render `boolean` (`Switch`), `multiselect` (existing
  `PickerField` in multi mode or `SelectionPop`), and `unit` as a suffix on the label.
  Split rendering into a core section and a collapsible details section — the app has no
  `CollapsibleSection`, so add a small one using `PressableScale` and the existing
  `gStyles.sectionHeader`.
- `formUtils.getInitialFormData/getEditFormData`: seed `false` for booleans and `[]`
  for multiselects.
- `PostDetailScreen.jsx`: render booleans as ✓/✗ rows and append `unit` to numbers.

#### Web (`zuuchmap_web`)
- `ProviderPostForm.jsx` `DynamicField`: same three types; wrap detail fields in the
  existing `CollapsibleSection`.
- `CustomerBrowse.jsx`: filter controls for `boolean` (tri-state) and numeric
  `_min`/`_max` range inputs — the backend already supports the range params.
- `AdminCategories.jsx`: expose `group`, the new types, and `unit` in the field editor
  so this stays admin-editable without a deploy.
- `PostDetail.jsx`: booleans and units, matching the app.

#### i18n
New keys in `mn` and `en` for every option value introduced (`H24`, `WEEKDAY_DAY`,
`BY_CALL`, `CITY`, `PROVINCE`, `NATIONWIDE`, `WHOLESALE`, `RETAIL`, `BOTH`,
`PETROL`…) plus the new field labels. Schema `labels`/`placeholders` carry mn/en/zh/ru
already, so client i18n is the fallback path only.

### Testing

- `category.service.spec.ts`: extend for the new seed — every category has ≥2 core
  fields, no category exceeds 5, every `required` field is in group `core`, and no
  attribute key collides with a Post column name.
- New spec for the required-field validation on create/update.
- `post.service` filter tests for the `boolean` and `multiselect` branches.
- Manual: post one listing per category on web and app, confirm the core/detail split
  renders and required validation fires.

### Open question

`capacity` carries a different unit per category (`т` for machinery, `нэгж/өдөр` for
factory). One key with a per-category `unit` keeps the vocabulary shared and the filter
uniform, at the cost of a slightly generic label. The alternative — `capacity_tons`,
`daily_capacity` — reads better per category but fragments the filter. This design takes
the shared key; worth confirming.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `zuuchmap_engine/src/enums/priceunit.ts` | **Create.** Single source of truth for price units incl. `MOTO_HOUR` | 1 |
| `zuuchmap_engine/src/post/entities/category-schema.entity.ts` | `FieldDef`: `boolean`/`multiselect` types, `group`, `placeholders` | 2 |
| `zuuchmap_engine/src/post/post.service.ts` | Filter branches for boolean + multiselect | 3 |
| `zuuchmap_engine/src/post/dto/*.ts` | Required-attribute validation on create/update | 4 |
| `zuuchmap_engine/src/post/category.service.ts` | Shared field library + new 13-category seed | 11 |
| `zuuchmap_engine/src/migrations/<ts>-CategoryFieldsRedesign.ts` | **Create.** The cutover | 12 |
| `zuuchmap_app/src/components/DynamicForm.jsx` | Render boolean/multiselect/unit + core/details split | 6 |
| `zuuchmap_app/src/components/CollapsibleSection.jsx` | **Create.** App has none; web already does | 6 |
| `zuuchmap_app/src/utils/formUtils.js` | Seed `false` / `[]` defaults for new types | 6 |
| `zuuchmap_app/src/screens/shared/PostDetailScreen.jsx` | Display booleans + units | 8 |
| `zuuchmap_web/src/pages/ProviderPostForm.jsx` | Same three types + `CollapsibleSection` | 7 |
| `zuuchmap_web/src/pages/CustomerBrowse.jsx` | Boolean + numeric-range browse filters | 9 |
| `zuuchmap_web/src/pages/AdminCategories.jsx` | Expose new types, `group`, `unit` | 10 |
| `zuuchmap_web/src/pages/PostDetail.jsx` | Display booleans + units | 8 |
| `zuuchmap_app/src/config/app.config.js`, `zuuchmap_web/src/lib/utils.js` | `PRICE_UNITS` + `MOTO_HOUR` | 5 |
| `*/i18n/{mn,en}.js` (4 files) | New option-value and field-label keys | 5, 11 |
| `CLAUDE.md` | Correct the false `PriceUnit` enum claim; document new types | 13 |

---

## Task 1: PriceUnit enum with MOTO_HOUR

The spec found that CLAUDE.md claims a `PriceUnit` enum exists when it does not — `src/enums/` holds only `bookingstatus`, `status`, `usertype`, so `price_unit` is an unvalidated `varchar` today.

**Files:**
- Create: `zuuchmap_engine/src/enums/priceunit.ts`
- Create: `zuuchmap_engine/src/enums/priceunit.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `enum PriceUnit`, `const PRICE_UNITS: string[]`, `isPriceUnit(v: unknown): boolean`. Task 4 imports `isPriceUnit`; Task 5 mirrors `PRICE_UNITS` into both clients.

- [ ] **Step 1: Write the failing test**

```ts
// zuuchmap_engine/src/enums/priceunit.spec.ts
import { PriceUnit, PRICE_UNITS, isPriceUnit } from './priceunit';

describe('PriceUnit', () => {
  it('includes MOTO_HOUR, distinct from HOUR', () => {
    // мото цаг is engine-meter time, not clock time — a machine on site ten
    // clock hours may log six мото цаг. Different numbers, different money.
    expect(PriceUnit.MOTO_HOUR).toBe('MOTO_HOUR');
    expect(PriceUnit.HOUR).toBe('HOUR');
    expect(PriceUnit.MOTO_HOUR).not.toBe(PriceUnit.HOUR);
  });

  it('exposes every unit the clients offer', () => {
    expect(PRICE_UNITS).toEqual([
      'HOUR', 'MOTO_HOUR', 'DAY', 'WEEK', 'MONTH',
      'PROJECT', 'UNIT', 'PIECE', 'SQM', 'TRIP', 'TOTAL',
    ]);
  });

  it('validates membership', () => {
    expect(isPriceUnit('MOTO_HOUR')).toBe(true);
    expect(isPriceUnit('moto_hour')).toBe(false);
    expect(isPriceUnit('FORTNIGHT')).toBe(false);
    expect(isPriceUnit(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd zuuchmap_engine && npx jest src/enums/priceunit.spec.ts`
Expected: FAIL — `Cannot find module './priceunit'`

- [ ] **Step 3: Write the implementation**

```ts
// zuuchmap_engine/src/enums/priceunit.ts

// Canonical price units. Both clients mirror this list; see
// zuuchmap_app/src/config/app.config.js and zuuchmap_web/src/lib/utils.js.
export enum PriceUnit {
  HOUR = 'HOUR',
  // Engine-meter hour (мото цаг), read off the machine's hour meter. Heavy
  // equipment is billed this way so idle time on site is not charged at
  // working rates — deliberately distinct from HOUR (clock time).
  MOTO_HOUR = 'MOTO_HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  PROJECT = 'PROJECT',
  UNIT = 'UNIT',
  PIECE = 'PIECE',
  SQM = 'SQM',
  TRIP = 'TRIP',
  TOTAL = 'TOTAL',
}

export const PRICE_UNITS: string[] = Object.values(PriceUnit);

export const isPriceUnit = (v: unknown): boolean =>
  typeof v === 'string' && (PRICE_UNITS as string[]).includes(v);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd zuuchmap_engine && npx jest src/enums/priceunit.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify and hand off**

Run: `cd zuuchmap_engine && npx jest` — the full suite must still pass. Report the new file; do not commit.

---

## Task 2: FieldDef gains boolean, multiselect, group, placeholders

**Files:**
- Modify: `zuuchmap_engine/src/post/entities/category-schema.entity.ts:3-13`

**Interfaces:**
- Consumes: nothing.
- Produces: the widened `FieldDef`. Tasks 3, 4, 6, 7, 9, 10, 11 all read `field.type === 'boolean' | 'multiselect'`, `field.group`, `field.placeholders`, `field.unit`.

- [ ] **Step 1: Widen the interface**

Replace the `FieldDef` interface with:

```ts
export interface FieldDef {
  key: string;
  label: string;
  labels?: Record<string, string>;
  type:
    | 'text' | 'textarea' | 'number' | 'select' | 'date' | 'phone'
    // Stores a real JSON boolean. Filtered by jsonb containment.
    | 'boolean'
    // Stores a JSON array of `options` values. Filtered by the `?` operator.
    | 'multiselect';
  options?: string[];
  required?: boolean;
  // Required fields render upfront; 'details' fields sit behind a collapsible.
  // Omitted means 'core'.
  group?: 'core' | 'details';
  placeholder?: string;
  // Localized placeholder, mirrors `labels`. Falls back to `placeholder`.
  placeholders?: Record<string, string>;
  filterable?: boolean;
  // Rendered as a suffix on the field label and on the post detail row.
  unit?: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd zuuchmap_engine && npx tsc --noEmit`
Expected: no errors. This is a pure widening — every existing `FieldDef` literal stays valid.

- [ ] **Step 3: Verify and hand off**

Run: `cd zuuchmap_engine && npx jest`. Report; do not commit.

---

## Task 3: Filter branches for boolean and multiselect

**Files:**
- Modify: `zuuchmap_engine/src/post/post.service.ts:231-260` (the `hasAttrs` block)
- Test: `zuuchmap_engine/src/post/post.service.filters.spec.ts` (create)

**Interfaces:**
- Consumes: `FieldDef` from Task 2.
- Produces: nothing new; existing `findAll` gains behavior. The query-param shape stays `attr.<key>=<value>`.

- [ ] **Step 1: Write the failing test**

The existing `hasAttrs` block builds SQL through a TypeORM `QueryBuilder`. Test it by capturing the `andWhere` calls on a stub.

```ts
// zuuchmap_engine/src/post/post.service.filters.spec.ts
import { buildAttrFilter } from './post.service';

describe('buildAttrFilter', () => {
  const calls: Array<[string, any]> = [];
  const qb = { andWhere: (sql: string, params: any) => { calls.push([sql, params]); return qb; } };
  beforeEach(() => { calls.length = 0; });

  it('matches a boolean by jsonb containment so the GIN index serves it', () => {
    buildAttrFilter(qb as any, { with_operator: 'true' }, new Map([['with_operator', 'boolean']]));
    expect(calls[0][0]).toContain('@>');
    expect(JSON.parse(calls[0][1].attr0)).toEqual({ with_operator: true });
  });

  it('treats "false" as false, not as a truthy string', () => {
    buildAttrFilter(qb as any, { delivery_available: 'false' }, new Map([['delivery_available', 'boolean']]));
    expect(JSON.parse(calls[0][1].attr0)).toEqual({ delivery_available: false });
  });

  it('matches a multiselect member with the ? operator', () => {
    buildAttrFilter(qb as any, { coverage: 'CITY' }, new Map([['coverage', 'multiselect']]));
    expect(calls[0][0]).toContain('?');
    expect(calls[0][1].attr0).toBe('CITY');
  });

  it('still range-filters numbers', () => {
    buildAttrFilter(qb as any, { capacity_min: '20' }, new Map([['capacity', 'number']]));
    expect(calls[0][0]).toContain('>=');
    expect(calls[0][1].attr0).toBe(20);
  });

  it('ignores an unparseable range value', () => {
    buildAttrFilter(qb as any, { capacity_min: 'abc' }, new Map([['capacity', 'number']]));
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd zuuchmap_engine && npx jest post.service.filters`
Expected: FAIL — `buildAttrFilter is not a function`.

- [ ] **Step 3: Extract and extend the filter builder**

Lift the existing loop out of `findAll` into an exported function so it is testable, then add the two branches. Replace the body of the `if (hasAttrs) {` block at `post.service.ts:231` with a call, and add this exported function to the same module:

```ts
// Exported for unit testing. `fieldTypes` maps a field key to its FieldDef type.
export function buildAttrFilter(
  qb: { andWhere: (sql: string, params: Record<string, any>) => any },
  attrs: Record<string, any>,
  fieldTypes: Map<string, string>,
): void {
  let i = 0;
  for (const [rawKey, val] of Object.entries(attrs ?? {})) {
    if (val === undefined || val === '') continue;
    const m = rawKey.match(/^([a-z0-9_]+?)(_min|_max)?$/);
    if (!m) continue;
    const [, key, range] = m;
    const p = `attr${i++}`;
    const type = fieldTypes.get(key);

    if (range) {
      const num = Number(val);
      if (Number.isNaN(num)) { i--; continue; }
      const op = range === '_min' ? '>=' : '<=';
      qb.andWhere(
        `post.attributes->>'${key}' ~ '^[0-9]+\\.?[0-9]*$' AND (post.attributes->>'${key}')::numeric ${op} :${p}`,
        { [p]: num },
      );
    } else if (type === 'boolean') {
      // Real JSON boolean, not the string "true" — containment hits the GIN index.
      qb.andWhere(`post.attributes @> :${p}::jsonb`, {
        [p]: JSON.stringify({ [key]: String(val) === 'true' }),
      });
    } else if (type === 'multiselect') {
      // `?` asks whether the stored array contains this value.
      qb.andWhere(`post.attributes->:${p}_k ? :${p}`, { [`${p}_k`]: key, [p]: String(val) });
    } else if (type === 'select') {
      qb.andWhere(`post.attributes @> :${p}::jsonb`, {
        [p]: JSON.stringify({ [key]: String(val) }),
      });
    } else {
      qb.andWhere(`post.attributes->>'${key}' ILIKE :${p}`, { [p]: `%${String(val)}%` });
    }
  }
}
```

Then in `findAll`:

```ts
if (hasAttrs) {
  const fieldTypes = await this.attributeFieldTypes(filters.category);
  buildAttrFilter(qb, filters.attrs ?? {}, fieldTypes);
}
```

> **Note on the `?` operator:** TypeORM's parameter syntax also uses `?` in some drivers. If the raw `?` collides, use the function form `jsonb_exists(post.attributes->:k, :v)` instead — same semantics, no operator ambiguity. Verify which one the running Postgres accepts in Step 4 and keep whichever works.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd zuuchmap_engine && npx jest post.service.filters`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify against a live database**

Start the engine (`npm run dev`), then:

```bash
curl -s 'http://localhost:8282/engine/posts?category=machineryrent&attr.with_operator=true' | head -c 300
```

Expected: HTTP 200 with `{ items: [...], total: n }`. Zero results is a pass — no post has the attribute yet. A 500 means the SQL is malformed; that is the failure this step exists to catch.

- [ ] **Step 6: Verify and hand off**

Run: `cd zuuchmap_engine && npx jest`. Report; do not commit.

---

## Task 4: Server-side required-attribute validation

Inert until Task 12 marks fields required — which is exactly why it lands first.

**Files:**
- Modify: `zuuchmap_engine/src/post/post.service.ts` (create + update paths)
- Test: `zuuchmap_engine/src/post/post.validation.spec.ts` (create)

**Interfaces:**
- Consumes: `FieldDef` (Task 2), `CategoryService.getCategory` (existing).
- Produces: `validateRequiredAttributes(schema: CategorySchema, attributes: Record<string, any>): string[]` — returns the list of missing field keys, empty when valid. Task 12's migration does **not** call it; only create/update do.

- [ ] **Step 1: Write the failing test**

```ts
// zuuchmap_engine/src/post/post.validation.spec.ts
import { validateRequiredAttributes } from './post.service';

const schema: any = {
  key: 'machineryrent',
  fields: [
    { key: 'manufacturer', label: 'M', type: 'text', required: true, group: 'core' },
    { key: 'with_operator', label: 'O', type: 'boolean', required: true, group: 'core' },
    { key: 'capacity', label: 'C', type: 'number', required: true, group: 'core' },
    { key: 'min_rental_days', label: 'D', type: 'number', group: 'details' },
  ],
};

describe('validateRequiredAttributes', () => {
  it('accepts a complete core set', () => {
    expect(validateRequiredAttributes(schema, {
      manufacturer: 'Komatsu', with_operator: true, capacity: 20,
    })).toEqual([]);
  });

  it('names every missing required field', () => {
    expect(validateRequiredAttributes(schema, { manufacturer: 'Komatsu' }).sort())
      .toEqual(['capacity', 'with_operator']);
  });

  it('accepts boolean false — false is an answer, not an absence', () => {
    expect(validateRequiredAttributes(schema, {
      manufacturer: 'Komatsu', with_operator: false, capacity: 20,
    })).toEqual([]);
  });

  it('accepts numeric zero', () => {
    expect(validateRequiredAttributes(schema, {
      manufacturer: 'K', with_operator: true, capacity: 0,
    })).toEqual([]);
  });

  it('rejects empty string and null', () => {
    expect(validateRequiredAttributes(schema, {
      manufacturer: '  ', with_operator: true, capacity: null,
    }).sort()).toEqual(['capacity', 'manufacturer']);
  });

  it('ignores optional details fields', () => {
    expect(validateRequiredAttributes(schema, {
      manufacturer: 'K', with_operator: true, capacity: 5, min_rental_days: undefined,
    })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd zuuchmap_engine && npx jest post.validation`
Expected: FAIL — `validateRequiredAttributes is not a function`.

- [ ] **Step 3: Implement**

```ts
// The false/0 cases are the whole reason this is not a truthiness check:
// "operator not included" and "capacity 0" are answers, not omissions.
export function validateRequiredAttributes(
  schema: { fields?: FieldDef[] },
  attributes: Record<string, any>,
): string[] {
  const attrs = attributes ?? {};
  return (schema?.fields ?? [])
    .filter((f) => f.required)
    .filter((f) => {
      const v = attrs[f.key];
      if (v === undefined || v === null) return true;
      if (typeof v === 'string') return v.trim() === '';
      if (Array.isArray(v)) return v.length === 0;
      return false;
    })
    .map((f) => f.key);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd zuuchmap_engine && npx jest post.validation`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into create and update**

In `PostService.create`, after the category schema is loaded and before the entity is saved:

```ts
const missing = validateRequiredAttributes(schema, dto.attributes ?? {});
if (missing.length) {
  throw new BadRequestException({
    message: 'MISSING_REQUIRED_ATTRIBUTES',
    fields: missing,
  });
}
```

Apply the identical check in `update`, but **only when `dto.attributes` is provided** — a partial update that does not touch attributes must not be rejected for a field the post never had. This is the grandfathering rule: existing posts stay live until someone edits their attributes.

Also validate the price unit while here:

```ts
if (dto.price_unit !== undefined && dto.price_unit !== null && !isPriceUnit(dto.price_unit)) {
  throw new BadRequestException('INVALID_PRICE_UNIT');
}
```

- [ ] **Step 6: Verify and hand off**

Run: `cd zuuchmap_engine && npx jest`. Report; do not commit.

---

## Task 5: MOTO_HOUR through both clients

**Files:**
- Modify: `zuuchmap_app/src/config/app.config.js:1`
- Modify: `zuuchmap_web/src/lib/utils.js:6` and `:24`
- Modify: `zuuchmap_app/src/i18n/locales/{mn,en}.js` (`priceUnit` block)
- Modify: `zuuchmap_web/src/i18n/{mn,en}.js:294`

**Interfaces:**
- Consumes: `PRICE_UNITS` ordering from Task 1.
- Produces: `MOTO_HOUR` selectable in both post forms and the admin category editor, labelled *мото цагаар* / *per engine hour*.

- [ ] **Step 1: Update both PRICE_UNITS constants**

Both lists must match `zuuchmap_engine/src/enums/priceunit.ts` exactly, including order — `MOTO_HOUR` sits immediately after `HOUR`.

```js
// zuuchmap_app/src/config/app.config.js:1
// Mirrors zuuchmap_engine/src/enums/priceunit.ts — keep in sync.
export const PRICE_UNITS = ['HOUR', 'MOTO_HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT', 'PIECE', 'SQM', 'TRIP', 'TOTAL'];
```

```js
// zuuchmap_web/src/lib/utils.js:6 — same array, same comment.
export const PRICE_UNITS = ['HOUR', 'MOTO_HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT', 'PIECE', 'SQM', 'TRIP', 'TOTAL']
```

Add to `PRICE_UNIT_KEYS` at `zuuchmap_web/src/lib/utils.js:24`: `MOTO_HOUR: 'priceUnit.motoHour',`

- [ ] **Step 2: Add the labels**

| File | Key | Value |
|---|---|---|
| `zuuchmap_app/src/i18n/locales/mn.js` `priceUnit` | `MOTO_HOUR` | `'мото цагаар'` |
| `zuuchmap_app/src/i18n/locales/en.js:223` `priceUnit` | `MOTO_HOUR` | `'per engine hour'` |
| `zuuchmap_web/src/i18n/mn.js:294` `priceUnit` | `motoHour` | `'мото цагаар'` |
| `zuuchmap_web/src/i18n/en.js:294` `priceUnit` | `motoHour` | `'per engine hour'` |

Note the case difference: the app keys on the raw enum value, web lowercases it via `t(\`priceUnit.${u.toLowerCase()}\`)`. `MOTO_HOUR.toLowerCase()` is `moto_hour`, **not** `motoHour` — so either name the web key `moto_hour` or change the lookup. **Name the web key `moto_hour`** and leave the lookup alone; it is the smaller change and matches how `sqm` already works.

Correcting the table above: the web key is `moto_hour`, not `motoHour`. Use `moto_hour` in both web i18n files and in `PRICE_UNIT_KEYS`.

- [ ] **Step 3: Verify**

Run: `cd zuuchmap_web && npm run build` — must succeed.

Then start the web dev server, open `/provider/posts/new`, and confirm the price-unit dropdown lists **мото цагаар** directly after **цагаар**. Confirm the same in the app's post form price section.

- [ ] **Step 4: Verify and hand off**

Report the six touched files; do not commit.

---

## Task 6: App renders boolean, multiselect, unit, and the core/details split

**Files:**
- Create: `zuuchmap_app/src/components/CollapsibleSection.jsx`
- Modify: `zuuchmap_app/src/components/DynamicForm.jsx`
- Modify: `zuuchmap_app/src/utils/formUtils.js:5`
- Modify: `zuuchmap_app/src/components/index.js` (export the new component)

**Interfaces:**
- Consumes: `FieldDef.type === 'boolean' | 'multiselect'`, `field.group`, `field.unit` (Task 2).
- Produces: `<CollapsibleSection title children defaultOpen />` for app use. Task 8 does not use it; nothing else depends on it.

- [ ] **Step 1: Create the collapsible**

The app has no collapsible component (web does, at `zuuchmap_web/src/components/CollapsibleSection.jsx`). Build the app equivalent on existing primitives — `PressableScale` for the press affordance, `gStyles.sectionHeader` for the header, `LayoutAnimation` for the open/close.

```jsx
// zuuchmap_app/src/components/CollapsibleSection.jsx
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from './PressableScale';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CollapsibleSection = ({ title, children, defaultOpen = false }) => {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(defaultOpen);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={styles.wrap}>
      <PressableScale onPress={toggle} style={styles.header} accessibilityRole="button"
        accessibilityState={{ expanded: open }}>
        <Text style={styles.title}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.secondary} />
      </PressableScale>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  title: { ...typography.styles.labelStrong, color: colors.text.primary },
  body: { paddingTop: spacing.md },
});

export default CollapsibleSection;
```

Export it from `zuuchmap_app/src/components/index.js` alongside the existing exports.

- [ ] **Step 2: Add boolean and multiselect renderers to DynamicForm**

Add these two components above `DynamicForm` in `DynamicForm.jsx`, after the existing `SelectField`:

```jsx
const BooleanField = ({ field, value, onChange, error }) => {
  const { colors } = useAppTheme();
  const { t, i18n } = useTranslation();
  const label = fieldLabel(field, t, i18n.language);
  return (
    <FormField
      label={label}
      required={!!field.required}
      error={error}
      component={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...typography.styles.body, color: colors.text.secondary }}>
            {value === true ? t('common.yes') : t('common.no')}
          </Text>
          <Switch
            value={value === true}
            onValueChange={onChange}
            trackColor={{ false: colors.border.light, true: colors.primary }}
            thumbColor={colors.onPrimary}
          />
        </View>
      }
    />
  );
};

const MultiSelectField = ({ field, value, onChange, error }) => {
  const { colors } = useAppTheme();
  const { t, i18n } = useTranslation();
  const label = fieldLabel(field, t, i18n.language);
  const selected = Array.isArray(value) ? value : [];
  const toggle = (opt) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  return (
    <FormField
      label={label}
      required={!!field.required}
      error={error}
      component={
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {(field.options || []).map((opt) => {
            const on = selected.includes(opt);
            return (
              <PressableScale
                key={opt}
                onPress={() => toggle(opt)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[
                  { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1 },
                  on
                    ? { ...colors.elevation.selected, borderColor: colors.primary, backgroundColor: colors.primary }
                    : { borderColor: colors.border.light, backgroundColor: colors.surface },
                ]}
              >
                <Text style={{ ...typography.styles.label, color: on ? colors.onPrimary : colors.text.primary }}>
                  {t(`attrs.${toCamel(opt.toLowerCase())}`, { defaultValue: opt })}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      }
    />
  );
};
```

Add the imports this needs at the top of the file: `Switch` from `react-native`, `PressableScale`, and `spacing, radius, typography` from `../design/theme`. Note `radius.full` (9999) is the pill value — there is no `radius.pill`. Note line 5 currently reads `import {  } from '../design/theme';` — an empty import left behind by an earlier refactor. Fill it rather than adding a second import line.

- [ ] **Step 3: Render label units and split core from details**

Extend `fieldLabel` so a `unit` shows in the label, and localize the placeholder:

```jsx
const fieldLabel = (field, t, lng) => {
  const base = field.labels?.[lng] ?? t(`attrs.${toCamel(field.key)}`, { defaultValue: field.label });
  return field.unit ? `${base} (${field.unit})` : base;
};

const fieldPlaceholder = (field, lng) =>
  field.placeholders?.[lng] ?? field.placeholder ?? undefined;
```

Use `fieldPlaceholder(field, i18n.language)` for the `placeholder` prop added earlier at line 107.

Then replace the single `fields.map(...)` with a core/details split. Extract the existing per-field switch into a local `renderField(field)` and drive it from two lists:

```jsx
const core = fields.filter((f) => (f.group ?? 'core') === 'core');
const details = fields.filter((f) => f.group === 'details');

return (
  <View>
    <View style={gStyles.sectionHeader}>
      <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.categoryDetails')}</Text>
    </View>
    {core.map(renderField)}
    {details.length > 0 && (
      <CollapsibleSection title={t('form.moreDetails')}>
        {details.map(renderField)}
      </CollapsibleSection>
    )}
  </View>
);
```

Keyboard `next` chaining currently spans all fields. Rebuild `chainKeys` from `core` only — chaining into a collapsed section would focus an invisible input:

```jsx
const chainKeys = core.filter((f) => !['select', 'textarea', 'boolean', 'multiselect'].includes(f.type)).map((f) => f.key);
```

- [ ] **Step 4: Seed defaults for the new types**

In `zuuchmap_app/src/utils/formUtils.js:5`, the attributes initializer maps every schema field to `''`. Booleans must start `false` and multiselects `[]`, or the first render of a `Switch` gets a string and React Native warns:

```js
Object.fromEntries((schema?.fields ?? []).map((f) => [
  f.key,
  f.type === 'boolean' ? false : f.type === 'multiselect' ? [] : '',
]))
```

Apply the same defaulting in `getEditFormData` so a post saved before a field existed still opens cleanly.

- [ ] **Step 5: Add the i18n keys**

`form.moreDetails` — mn `'Нэмэлт мэдээлэл'`, en `'More details'`.
`common.yes` / `common.no` — confirm they exist in both locale files; add mn `'Тийм'` / `'Үгүй'`, en `'Yes'` / `'No'` if missing.

- [ ] **Step 6: Verify**

Start Expo (`npm run dev:app`). There is no category using `boolean` or `multiselect` yet — that is Task 12 — so verify against a temporary local schema override: in the running app, confirm the existing post form still renders every current field, that placeholders now appear, and that no field is lost. Then temporarily add `{ key: 'test_bool', label: 'Test', type: 'boolean', group: 'details' }` to one category via the admin UI at `/admin/categories`, reload the app form, and confirm the switch renders inside the collapsible. **Remove the test field before finishing.**

- [ ] **Step 7: Verify and hand off**

Report the touched files; do not commit.

---

## Task 7: Web post form renders the same three types

**Files:**
- Modify: `zuuchmap_web/src/pages/ProviderPostForm.jsx:61-87` (`DynamicField`) and `:390`

**Interfaces:**
- Consumes: Task 2's `FieldDef`; the existing `CollapsibleSection` at `zuuchmap_web/src/components/CollapsibleSection.jsx` (props: `title`, `defaultOpen`, `children`, `className`, `variant`).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add the two new branches to DynamicField**

Insert before the final `return` in `DynamicField`, and add `unit` to the label:

```jsx
function DynamicField({ field, value, onChange, t }) {
  const unit = field.unit ? ` (${field.unit})` : ''
  const lbl = <>{getFieldLabel(field, t)}{unit}{field.required && <span className="text-danger"> *</span>}</>
  // ... existing select and textarea branches, with `placeholder={field.placeholder || ''}` ...

  if (field.type === 'boolean') return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{lbl}</label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-primary" />
        <span className="text-sm text-text">{value === true ? t('common.yes') : t('common.no')}</span>
      </label>
    </div>
  )

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
    return (
      <div>
        <label className="text-xs text-muted block mb-1.5">{lbl}</label>
        <div className="flex flex-wrap gap-2">
          {field.options?.map((opt) => (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              aria-pressed={selected.includes(opt)}
              className={`px-3 py-1.5 text-xs rounded-btn border transition-colors ${
                selected.includes(opt)
                  ? 'bg-primary text-on-primary border-primary'
                  : 'border-border/40 text-muted hover:text-text'
              }`}>
              {getOptionLabel(opt, t)}
            </button>
          ))}
        </div>
      </div>
    )
  }
  // ... existing text/number/phone return ...
}
```

- [ ] **Step 2: Split core from details at the call site**

Replace `ProviderPostForm.jsx:390`:

```jsx
{schema?.fields?.filter((f) => (f.group ?? 'core') === 'core').map((f) => (
  <DynamicField key={f.key} field={f} value={form.attributes[f.key] ?? ''} onChange={(v) => setAttr(f.key, v)} t={t} />
))}
{schema?.fields?.some((f) => f.group === 'details') && (
  <CollapsibleSection title={t('form.moreDetails')} defaultOpen={false} variant="bare" className="col-span-full">
    {schema.fields.filter((f) => f.group === 'details').map((f) => (
      <DynamicField key={f.key} field={f} value={form.attributes[f.key] ?? ''} onChange={(v) => setAttr(f.key, v)} t={t} />
    ))}
  </CollapsibleSection>
)}
```

Import `CollapsibleSection` at the top of the file.

- [ ] **Step 3: Add the missing yes/no keys to web i18n**

`common.yes` and `common.no` exist in the app (`locales/en.js:30`, `locales/mn.js:52`) but **not on web** — `zuuchmap_web/src/i18n/en.js:48` `common` block has `back`/`close` and no `yes`/`no`. The boolean renderer above calls `t('common.yes')`, so add to both web locale files:

| File | Keys |
|---|---|
| `zuuchmap_web/src/i18n/en.js` `common` | `yes: 'Yes', no: 'No',` |
| `zuuchmap_web/src/i18n/mn.js` `common` | `yes: 'Тийм', no: 'Үгүй',` |

Task 8 depends on these too.

- [ ] **Step 4: Localize the placeholder**

Task 2 added `placeholders` (localized, mirroring `labels`) but the web form reads only the flat `placeholder`. Add a helper beside `DynamicField` and use it in the textarea and text branches:

```jsx
const fieldPlaceholder = (field, lng) => field.placeholders?.[lng] ?? field.placeholder ?? ''
```

Get `lng` from `i18n.language` via `useTranslation()` in the parent and pass it down, matching how `t` is already threaded into `DynamicField`.

- [ ] **Step 5: Default booleans and multiselects in form state**

Find where `form.attributes` is initialized for a chosen category and apply the same rule as Task 6 Step 4: `boolean → false`, `multiselect → []`, everything else `''`.

- [ ] **Step 6: Surface the server's missing-field error**

Task 4 throws `{ message: 'MISSING_REQUIRED_ATTRIBUTES', fields: [...] }`. Map it in the form's submit error handler to a readable message naming the fields, using `getFieldLabel` for each key. Without this the provider sees a raw error code and cannot tell which field to fill.

- [ ] **Step 7: Verify**

Run: `cd zuuchmap_web && npm run build` — must succeed.

Add a temporary `boolean` and a temporary `multiselect` field to one category via `/admin/categories`, open `/provider/posts/new`, and confirm both render, the details collapsible appears, and a submit missing a required field shows the field name rather than a code. **Remove the test fields before finishing.**

- [ ] **Step 8: Verify and hand off**

Report; do not commit.

---

## Task 8: Post detail shows booleans and units on both clients

**Files:**
- Modify: `zuuchmap_app/src/screens/shared/PostDetailScreen.jsx:561`
- Modify: `zuuchmap_web/src/pages/PostDetail.jsx:314`

**Interfaces:**
- Consumes: `FieldDef.type`, `FieldDef.unit`.
- Produces: nothing.

- [ ] **Step 1: App — render by type**

At `PostDetailScreen.jsx:561` the attribute row already resolves `fieldDef` from the schema. Replace the raw value render with a type-aware one:

```jsx
const renderAttrValue = (fieldDef, value, t) => {
  if (fieldDef?.type === 'boolean') return value === true ? t('common.yes') : t('common.no');
  if (fieldDef?.type === 'multiselect' && Array.isArray(value)) {
    return value.map((v) => t(`attrs.${toCamel(String(v).toLowerCase())}`, { defaultValue: v })).join(', ');
  }
  if (fieldDef?.type === 'select') {
    return t(`attrs.${toCamel(String(value).toLowerCase())}`, { defaultValue: String(value) });
  }
  return fieldDef?.unit ? `${value} ${fieldDef.unit}` : String(value);
};
```

Skip the row entirely when the value is `undefined`, `null`, `''`, or an empty array — an optional detail nobody filled should not render a blank row.

- [ ] **Step 2: Web — same logic**

Apply the equivalent at `PostDetail.jsx:314`, reusing `getOptionLabel` for select and multiselect values and `t('common.yes'/'common.no')` for booleans.

- [ ] **Step 3: Verify**

Run: `cd zuuchmap_web && npm run build`.

With the temporary test fields from Task 7 still present, create a post that sets them, open its detail page on web and in the app, and confirm: boolean shows Тийм/Үгүй not `true`, multiselect shows a comma list not `["A","B"]`, and a numeric field with a unit shows `20 т`. **Then remove the test fields.**

- [ ] **Step 4: Verify and hand off**

Report; do not commit.

---

## Task 9: Browse filters for boolean and numeric range

**Files:**
- Modify: `zuuchmap_web/src/pages/CustomerBrowse.jsx:168` and its filter render block

**Interfaces:**
- Consumes: Task 3's query params — `attr.<key>=true|false` for boolean, `attr.<key>_min` / `attr.<key>_max` for numbers.
- Produces: nothing.

- [ ] **Step 1: Add an AttrFilter component**

The file already holds `attrFilters` state and a debounced `priceInputs` pattern at the price block (`CustomerBrowse.jsx:190-196`) — mirror it rather than inventing a second idiom. Add above the component's `return`:

```jsx
function AttrFilter({ field, value, onChange, t }) {
  const label = getFieldLabel(field, t) + (field.unit ? ` (${field.unit})` : '')

  if (field.type === 'boolean') {
    // Tri-state. "Any" must DELETE the param — sending '' would be read as a
    // filter by the engine's `val === ''` guard and silently match nothing.
    const opts = [['', t('filter.any')], ['true', t('common.yes')], ['false', t('common.no')]]
    return (
      <div>
        <p className="text-xs text-muted mb-1">{label}</p>
        <div className="flex rounded-btn border border-border/40 overflow-hidden">
          {opts.map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => onChange(field.key, v)}
              aria-pressed={(value ?? '') === v}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                (value ?? '') === v ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
              }`}>{lbl}</button>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'number') {
    return (
      <div>
        <p className="text-xs text-muted mb-1">{label}</p>
        <div className="flex gap-2">
          <Input type="number" inputMode="numeric" placeholder={t('filter.min')}
            value={value?.min ?? ''} onChange={(e) => onChange(`${field.key}_min`, e.target.value)}
            className="bg-surface rounded-btn w-full" />
          <Input type="number" inputMode="numeric" placeholder={t('filter.max')}
            value={value?.max ?? ''} onChange={(e) => onChange(`${field.key}_max`, e.target.value)}
            className="bg-surface rounded-btn w-full" />
        </div>
      </div>
    )
  }

  if (field.type === 'select' || field.type === 'multiselect') {
    return (
      <div>
        <p className="text-xs text-muted mb-1">{label}</p>
        <Input as="select" value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)}
          className="bg-surface rounded-btn w-full">
          <option value="">{t('filter.any')}</option>
          {field.options?.map((o) => <option key={o} value={o}>{getOptionLabel(o, t)}</option>)}
        </Input>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-muted mb-1">{label}</p>
      <Input value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)}
        className="bg-surface rounded-btn w-full" />
    </div>
  )
}
```

- [ ] **Step 2: Make the change handler delete rather than blank**

The existing attr handler must remove the key when the value is empty, or a cleared filter still ships `attr.x=` in the URL:

```jsx
const handleAttrChange = (key, val) => {
  setAttrFilters((prev) => {
    const next = { ...prev }
    if (val === '' || val === undefined || val === null) delete next[key]
    else next[key] = val
    return next
  })
  resetPage()
}
```

Debounce the numeric inputs exactly as `handlePriceChange` debounces — reuse that debounce helper rather than adding a second one.

- [ ] **Step 3: Render, capped at four**

The design caps a category at four browse filters; Task 11's seed test enforces it, but an admin can still mark a fifth filterable, so the UI must degrade rather than sprawl:

```jsx
{filterFields.slice(0, 4).map((f) => (
  <AttrFilter key={f.key} field={f} t={t}
    value={f.type === 'number' ? { min: attrFilters[`${f.key}_min`], max: attrFilters[`${f.key}_max`] } : attrFilters[f.key]}
    onChange={handleAttrChange} />
))}
{filterFields.length > 4 && (
  <CollapsibleSection title={t('filter.more')} defaultOpen={false} variant="bare">
    {filterFields.slice(4).map((f) => (
      <AttrFilter key={f.key} field={f} t={t}
        value={f.type === 'number' ? { min: attrFilters[`${f.key}_min`], max: attrFilters[`${f.key}_max`] } : attrFilters[f.key]}
        onChange={handleAttrChange} />
    ))}
  </CollapsibleSection>
)}
```

Import `CollapsibleSection` and `getOptionLabel`. Add i18n keys `filter.any` (mn `'Бүгд'`, en `'Any'`) and `filter.more` (mn `'Бусад шүүлтүүр'`, en `'More filters'`) to both web locale files.

- [ ] **Step 4: Verify**

Run: `cd zuuchmap_web && npm run build`.

Using a temporary filterable boolean and a filterable number on one category, confirm each control changes the result set and that clearing a filter removes the param from the URL rather than sending an empty value.

- [ ] **Step 5: Verify and hand off**

Report; do not commit.

---

## Task 10: Admin category editor exposes the new properties

Without this the whole system stops being admin-editable, which is the property CLAUDE.md protects most explicitly.

**Files:**
- Modify: `zuuchmap_web/src/pages/AdminCategories.jsx:34` (`emptyField`), `:221-260` (the field editor rows)

**Interfaces:**
- Consumes: Task 2's `FieldDef`.
- Produces: admin-authored schemas carrying `boolean`, `multiselect`, `group`, `unit`.

- [ ] **Step 1: Extend the field template**

```js
const emptyField = () => ({ key: '', label: '', labels: {}, type: 'text', required: false, filterable: false, group: 'core', placeholder: '', unit: '', options: [] })
```

- [ ] **Step 2: Extend FIELD_TYPES and add the group/unit controls**

Add the two new types to the `FIELD_TYPES` constant at the top of the file:

```js
const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'phone']
```

The field row's second grid (`AdminCategories.jsx:230-236`) currently holds the type select and the placeholder input. Add a third row beneath it for `group` and `unit`:

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
  <Input as="select" value={fld.group ?? 'core'} onChange={(e) => updateField(i, 'group', e.target.value)} className="bg-background">
    <option value="core">{t('admin.fieldGroupCore')}</option>
    <option value="details">{t('admin.fieldGroupDetails')}</option>
  </Input>
  <Input value={fld.unit ?? ''} onChange={(e) => updateField(i, 'unit', e.target.value)}
    placeholder="т" className="bg-background" />
</div>
```

The options editor at `:248` is gated on `fld.type === 'select'`. Widen it so multiselect gets the same control:

```jsx
{(fld.type === 'select' || fld.type === 'multiselect') && (
```

- [ ] **Step 3: Guard the contradictory combination**

`required: true` with `group: 'details'` would hide a mandatory field behind a collapsible, so a provider could never submit. Block it at save. In the existing save handler, before the API call:

```js
const contradictory = form.fields.filter((f) => f.required && f.group === 'details')
if (contradictory.length) {
  setError(t('admin.fieldRequiredDetailsConflict', { keys: contradictory.map((f) => f.key).join(', ') }))
  return
}
```

Add i18n keys to both web locale files:

| Key | mn | en |
|---|---|---|
| `admin.fieldGroupCore` | `'Үндсэн'` | `'Core'` |
| `admin.fieldGroupDetails` | `'Нэмэлт'` | `'Details'` |
| `admin.fieldRequiredDetailsConflict` | `'Заавал бөглөх талбар "Нэмэлт" бүлэгт байж болохгүй: {{keys}}'` | `'A required field cannot sit in the Details group: {{keys}}'` |

- [ ] **Step 4: Verify**

Run: `cd zuuchmap_web && npm run build`.

At `/admin/categories`, create a field of each new type on a scratch category, save, reload, and confirm every property round-trips. Confirm the required+details combination is rejected. **Delete the scratch fields afterwards.**

- [ ] **Step 5: Verify and hand off**

Report; do not commit.

---

## Task 11: The shared field library and the new seed

Data only — writes the new schema definitions but does not yet apply them to an existing database. Task 12 does that.

**Files:**
- Modify: `zuuchmap_engine/src/post/category.service.ts:137-145` (replace `rentalFields` / `hoursField`) and the whole `categories` array
- Modify: `zuuchmap_engine/src/post/category.service.spec.ts`
- Modify: `zuuchmap_app/src/i18n/locales/{mn,en}.js`, `zuuchmap_web/src/i18n/{mn,en}.js` (`attrs` blocks)

**Interfaces:**
- Consumes: `FieldDef` (Task 2), `PriceUnit` (Task 1).
- Produces: the exported field builders `identity`, `capacity`, `condition`, `withOperator`, `delivery`, `experience`, `licenseNo`, `hours`, `coverage`, `responseTime`. Task 12 imports the finished `categories` array to write the migration payload.

- [ ] **Step 1: Write the failing test**

```ts
// append to zuuchmap_engine/src/post/category.service.spec.ts
import { CATEGORY_SEED } from './category.service';

const POST_COLUMNS = ['title','details','province','district','address','latitude','longitude',
  'price_amount','price_unit','contact_phone','contact_email','available_from','available_until',
  'website','images','status','views','category','subcategory'];

describe('CATEGORY_SEED', () => {
  it('defines exactly 13 categories', () => {
    expect(CATEGORY_SEED).toHaveLength(13);
  });

  it('gives every category 2-5 required core fields', () => {
    for (const c of CATEGORY_SEED) {
      const core = (c.fields ?? []).filter((f: any) => (f.group ?? 'core') === 'core');
      expect(core.length).toBeGreaterThanOrEqual(2);
      expect(core.length).toBeLessThanOrEqual(5);
      for (const f of core) expect(f.required).toBe(true);
    }
  });

  it('never marks a details field required', () => {
    for (const c of CATEGORY_SEED) {
      for (const f of (c.fields ?? []).filter((f: any) => f.group === 'details')) {
        expect(f.required).toBeFalsy();
      }
    }
  });

  it('never collides an attribute key with a Post column', () => {
    for (const c of CATEGORY_SEED) {
      for (const f of c.fields ?? []) expect(POST_COLUMNS).not.toContain(f.key);
    }
  });

  it('gives every field mn and en labels', () => {
    for (const c of CATEGORY_SEED) {
      for (const f of c.fields ?? []) {
        expect(f.labels?.mn).toBeTruthy();
        expect(f.labels?.en).toBeTruthy();
      }
    }
  });

  it('keeps one key per concept across categories', () => {
    // The bug this guards: license_info in one category, certifications in another.
    const byKey = new Map<string, string>();
    for (const c of CATEGORY_SEED) {
      for (const f of c.fields ?? []) {
        const prev = byKey.get(f.key);
        if (prev) expect(f.type).toBe(prev); // same key ⇒ same type everywhere
        else byKey.set(f.key, f.type);
      }
    }
    expect(byKey.has('license_info')).toBe(false);
    expect(byKey.has('certifications')).toBe(false);
    expect(byKey.has('license_no')).toBe(true);
  });

  it('exposes at most four browse filters per category', () => {
    for (const c of CATEGORY_SEED) {
      expect((c.fields ?? []).filter((f: any) => f.filterable).length).toBeLessThanOrEqual(4);
    }
  });

  it('prices machineryrent and miningsupport by engine hour', () => {
    const get = (k: string) => CATEGORY_SEED.find((c: any) => c.key === k);
    expect(get('machineryrent')!.default_price_unit).toBe('MOTO_HOUR');
    expect(get('miningsupport')!.default_price_unit).toBe('MOTO_HOUR');
  });

  it('rebuilds materialstore subcategories around the material, not the seller', () => {
    const ms = CATEGORY_SEED.find((c: any) => c.key === 'materialstore')!;
    const values = (ms.subcategories ?? []).map((s: any) => s.value);
    expect(values).toContain('cement');
    expect(values).toContain('rebar');
    expect(values).not.toContain('wholesale');
    expect(values).not.toContain('retail');
    expect((ms.fields ?? []).some((f: any) => f.key === 'sale_type')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd zuuchmap_engine && npx jest category.service`
Expected: FAIL — `CATEGORY_SEED` is not exported.

- [ ] **Step 3: Write the field library**

Replace the `rentalFields` and `hoursField` helpers with the full builder set. Each returns a `FieldDef` with `labels` for mn, en, zh and ru — zh/ru are retired in the clients but the design keeps them in schema data so restoring a locale stays a client-side change.

```ts
type Grp = 'core' | 'details';
const L = (mn: string, en: string, zh: string, ru: string) => ({ mn, en, zh, ru });

const identity = (pick: Array<'manufacturer' | 'model' | 'year'>, group: Grp = 'core'): FieldDef[] => {
  const all: Record<string, FieldDef> = {
    manufacturer: { key: 'manufacturer', label: 'Үйлдвэрлэгч/Брэнд', labels: L('Үйлдвэрлэгч/Брэнд','Manufacturer/Brand','制造商/品牌','Производитель/Бренд'), type: 'text', required: group === 'core', group, filterable: true },
    model:        { key: 'model', label: 'Загвар', labels: L('Загвар','Model','型号','Модель'), type: 'text', required: group === 'core', group },
    year:         { key: 'year', label: 'Үйлдвэрлэсэн он', labels: L('Үйлдвэрлэсэн он','Manufactured year','生产年份','Год выпуска'), type: 'number', required: group === 'core', group, filterable: true, placeholder: '2020' },
  };
  return pick.map((k) => ({ ...all[k] }));
};

const capacity = (labels: Record<string, string>, unit: string, group: Grp = 'core'): FieldDef =>
  ({ key: 'capacity', label: labels.mn, labels, type: 'number', required: group === 'core', group, filterable: true, unit });

const condition = (group: Grp = 'core'): FieldDef =>
  ({ key: 'condition', label: 'Нөхцөл байдал', labels: L('Нөхцөл байдал','Condition','状况','Состояние'), type: 'select', required: group === 'core', group, filterable: group === 'core', options: ['NEW','EXCELLENT','GOOD','FAIR','NEEDS_REPAIR'] });

const withOperator = (labels: Record<string, string>): FieldDef =>
  ({ key: 'with_operator', label: labels.mn, labels, type: 'boolean', required: true, group: 'core', filterable: true });

const delivery = (group: Grp = 'core'): FieldDef =>
  ({ key: 'delivery_available', label: 'Хүргэлттэй', labels: L('Хүргэлттэй','Delivery available','提供配送','Есть доставка'), type: 'boolean', required: group === 'core', group });

const experience = (): FieldDef =>
  ({ key: 'experience_years', label: 'Туршлага (жил)', labels: L('Туршлага (жил)','Experience (years)','经验（年）','Опыт (лет)'), type: 'number', required: true, group: 'core', filterable: true });

const licenseNo = (group: Grp = 'core'): FieldDef =>
  ({ key: 'license_no', label: 'Тусгай зөвшөөрлийн дугаар', labels: L('Тусгай зөвшөөрлийн дугаар','Licence number','许可证号','Номер лицензии'), type: 'text', required: group === 'core', group });

const hours = (group: Grp = 'core'): FieldDef =>
  ({ key: 'operating_hours', label: 'Ажиллах цаг', labels: L('Ажиллах цаг','Operating hours','营业时间','Время работы'), type: 'select', required: group === 'core', group, filterable: true, options: ['H24','WEEKDAY_DAY','DAILY_DAY','BY_CALL'] });

const coverage = (group: Grp = 'core'): FieldDef =>
  ({ key: 'coverage', label: 'Үйлчлэх хүрээ', labels: L('Үйлчлэх хүрээ','Coverage','服务范围','Зона обслуживания'), type: 'select', required: group === 'core', group, filterable: true, options: ['CITY','PROVINCE','NATIONWIDE'] });

const responseTime = (group: Grp = 'core'): FieldDef =>
  ({ key: 'response_time_min', label: 'Хүрэлцэн ирэх хугацаа', labels: L('Хүрэлцэн ирэх хугацаа','Response time','响应时间','Время реагирования'), type: 'number', required: group === 'core', group, filterable: group === 'core', unit: 'мин' });
```

- [ ] **Step 4: Build CATEGORY_SEED from the Design section's per-category tables**

Export the array as `CATEGORY_SEED` and have `seedCategories()` consume it. Transcribe all 13 categories exactly from the `## Design` section's "Per-category fields" tables — every core field carries `required: true` and `group: 'core'`; every detail field carries `group: 'details'` and no `required`. Keep the existing `icon`, `color`, `sort_order`, `emphasized` and `post_expiry_days` values unchanged; only `fields`, `default_price_unit` for `machineryrent`/`miningsupport`, and `materialstore.subcategories` change.

`materialstore` subcategories, replacing `individual`/`wholesale`/`retail`:

```ts
subcategories: [
  { value: 'cement', display: 'Цемент', labels: L('Цемент','Cement','水泥','Цемент') },
  { value: 'aggregate', display: 'Хайрга, элс', labels: L('Хайрга, элс','Aggregate','砂石','Щебень, песок') },
  { value: 'rebar', display: 'Арматур, металл', labels: L('Арматур, металл','Rebar & metal','钢筋、金属','Арматура, металл') },
  { value: 'timber', display: 'Мод материал', labels: L('Мод материал','Timber','木材','Пиломатериалы') },
  { value: 'insulation', display: 'Дулаалга', labels: L('Дулаалга','Insulation','保温材料','Утеплитель') },
  { value: 'brick_block', display: 'Тоосго, блок', labels: L('Тоосго, блок','Brick & block','砖块','Кирпич, блок') },
  { value: 'roofing', display: 'Дээврийн материал', labels: L('Дээврийн материал','Roofing','屋顶材料','Кровля') },
  { value: 'finishing', display: 'Заслын материал', labels: L('Заслын материал','Finishing','装饰材料','Отделка') },
  { value: 'plumbing_electrical', display: 'Сантехник, цахилгаан', labels: L('Сантехник, цахилгаан','Plumbing & electrical','水暖电气','Сантехника, электрика') },
  { value: 'other', display: 'Бусад', labels: L('Бусад','Other','其他','Прочее') },
],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd zuuchmap_engine && npx jest category.service`
Expected: PASS. The four-filter cap and the 2–5 core cap will likely fail on first transcription — that is the test doing its job. Fix the seed, not the test.

- [ ] **Step 6: Add i18n for every new option value**

Add to the `attrs` block of all four locale files: `h24`, `weekdayDay`, `dailyDay`, `byCall`, `city`, `province`, `nationwide`, `wholesale`, `retail`, `both`, `petrol`, `diesel`, `gas`, `electric`, plus labels for every new field key. Schema `labels` are the primary source, so these are the fallback path — but they must exist, because `getFieldLabel` consults them when a locale is missing from `labels`.

- [ ] **Step 7: Verify and hand off**

Run: `cd zuuchmap_engine && npx jest` and `cd zuuchmap_web && npm run build`. Report; do not commit.

---

## Task 12: The cutover migration

**⚠ Read before starting.** `migrationsRun: true` means the dev server executes this file the moment it appears on disk during a watch restart. **Stop every running `npm run dev` before creating it.** Back the database up first — `.claude/skills/deploy/deploy.sh` documents the backup step.

**Files:**
- Create: `zuuchmap_engine/src/migrations/<timestamp>-CategoryFieldsRedesign.ts`

**Interfaces:**
- Consumes: `CATEGORY_SEED` (Task 11).
- Produces: a database whose 13 schemas match the new design and whose posts carry no orphaned attributes.

- [ ] **Step 1: Write the migration**

Timestamp must exceed the latest existing migration (`1784333600000-CategoryExpansion.ts`).

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import { CATEGORY_SEED } from '../post/category.service';

// Replaces every category's field definitions with the redesigned schema and
// prunes post attributes that no longer belong to any field.
//
// ⚠ IRREVERSIBLE DATA LOSS: down() restores the field DEFINITIONS but cannot
// restore attribute VALUES pruned in step 3. The user confirmed conflicting
// post data is disposable.
export class CategoryFieldsRedesign1784334000000 implements MigrationInterface {
  name = 'CategoryFieldsRedesign1784334000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const cat of CATEGORY_SEED) {
      await queryRunner.query(
        `UPDATE "category_schema" SET "fields" = $1::jsonb WHERE "key" = $2`,
        [JSON.stringify(cat.fields ?? []), cat.key],
      );
      if (cat.default_price_unit) {
        await queryRunner.query(
          `UPDATE "category_schema" SET "default_price_unit" = $1 WHERE "key" = $2`,
          [cat.default_price_unit, cat.key],
        );
      }
    }

    // materialstore: subcategory was the seller type; it becomes a field.
    await queryRunner.query(
      `UPDATE "post" SET "attributes" = COALESCE("attributes", '{}'::jsonb) ||
         jsonb_build_object('sale_type',
           CASE "subcategory" WHEN 'wholesale' THEN 'WHOLESALE' ELSE 'RETAIL' END),
         "subcategory" = 'other'
       WHERE "category" = 'materialstore'
         AND "subcategory" IN ('individual','wholesale','retail')`,
    );
    const ms = CATEGORY_SEED.find((c: any) => c.key === 'materialstore');
    await queryRunner.query(
      `UPDATE "category_schema" SET "subcategories" = $1::jsonb WHERE "key" = 'materialstore'`,
      [JSON.stringify(ms?.subcategories ?? [])],
    );

    // Prune attribute keys that no longer exist on the category.
    for (const cat of CATEGORY_SEED) {
      const keys = (cat.fields ?? []).map((f: any) => f.key);
      await queryRunner.query(
        `UPDATE "post" SET "attributes" = COALESCE((
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("attributes")
           AS kv(k, v) WHERE k = ANY($1)
         ), '{}'::jsonb)
         WHERE "category" = $2 AND "attributes" IS NOT NULL AND "attributes" <> '{}'::jsonb`,
        [keys, cat.key],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Field definitions only — pruned attribute values are not recoverable.
    throw new Error(
      'CategoryFieldsRedesign is not reversible: post attributes were pruned. ' +
      'Restore from the pre-migration database backup instead.',
    );
  }
}
```

- [ ] **Step 2: Back up, then run it**

```bash
cd zuuchmap_engine
pg_dump "$DATABASE_URL" > /tmp/pre-fields-redesign.sql   # creds in ~/.zuuchmap-deploy.env
npm run migration:run    # confirm the exact script name in package.json first
```

Expected: the migration reports success and appears in the `migrations` table.

- [ ] **Step 3: Verify the data**

```sql
-- every category now has required core fields
SELECT key, jsonb_array_length(fields) AS n,
       (SELECT count(*) FROM jsonb_array_elements(fields) f WHERE (f->>'required')::bool) AS required
FROM category_schema ORDER BY sort_order;

-- no post retains an attribute key its category no longer defines
SELECT p.category, k FROM post p, jsonb_object_keys(p.attributes) k
WHERE NOT EXISTS (
  SELECT 1 FROM category_schema c, jsonb_array_elements(c.fields) f
  WHERE c.key = p.category AND f->>'key' = k
) LIMIT 20;

-- materialstore moved off seller-type subcategories
SELECT subcategory, attributes->>'sale_type', count(*)
FROM post WHERE category = 'materialstore' GROUP BY 1, 2;
```

Expected: the first query shows 13 rows each with `required >= 2`; the second returns **zero rows**; the third shows only `other` with a populated `sale_type`.

- [ ] **Step 4: End-to-end check on both clients**

Create one post in `machineryrent` on web and one in `sos` on the app. Confirm: required core fields block submission when blank, the details collapsible holds the optional fields, `MOTO_HOUR` is selectable as the price unit for machinery, and the post renders correctly on its detail page. Then browse `/customer/browse?category=machineryrent` and confirm the capacity range filter and the operator boolean filter both narrow results.

- [ ] **Step 5: Verify and hand off**

Run: `cd zuuchmap_engine && npx jest` and `cd zuuchmap_web && npm run build`. Report the migration filename and the verification query output; do not commit.

---

## Task 13: Correct the documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Fix the false enum claim**

The Enums line lists `PriceUnit` among entities that exist. Before Task 1 it did not exist. Now it does — verify the line is accurate and add `MOTO_HOUR`'s meaning, since "engine hour vs clock hour" is not guessable from the name.

- [ ] **Step 2: Document the new FieldDef capabilities**

Extend the "Category system" section: `boolean` and `multiselect` types, the `group: 'core' | 'details'` split and what it means for form rendering, `unit` rendering, `placeholders` localization, and the rule that required fields must be `group: 'core'`. Note the four-filter-per-category cap and that schema field order controls filter priority.

- [ ] **Step 3: Record the seed/migration split**

Add a line stating that `seedCategories()` only runs on an empty database, so any schema change to a live environment needs a migration — this is the trap Task 12 exists to work around and it will recur.

- [ ] **Step 4: Verify and hand off**

Re-read the changed sections against the code. Report; do not commit.

---

## Verification Summary

| Task | Command / check | Expected |
|---|---|---|
| 1 | `npx jest src/enums/priceunit.spec.ts` | 3 pass |
| 2 | `npx tsc --noEmit` | clean |
| 3 | `npx jest post.service.filters` + live curl | 5 pass, HTTP 200 |
| 4 | `npx jest post.validation` | 6 pass |
| 5 | `npm run build` + dropdown shows мото цагаар | pass |
| 6 | Expo form renders switch in collapsible | pass |
| 7 | `npm run build` + form renders both new types | pass |
| 8 | Detail page shows Тийм/Үгүй and `20 т` | pass |
| 9 | Filters narrow results; cleared filters drop the param | pass |
| 10 | Admin round-trips every new property | pass |
| 11 | `npx jest category.service` | all pass |
| 12 | Orphan-attribute SQL query | **zero rows** |
| 13 | CLAUDE.md matches the code | pass |
