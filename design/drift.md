# Design ↔ code drift (2026-10-16)

Every desktop route of the live web app (dev seed, each role) was screenshotted and set beside its Figma frame; the phone-width web and the Figma phone frames were sampled the same way. Evidence: `as-built/` here and the **7 · As built** page in Figma. The app (Expo) was not driven screen by screen in this pass.

Each finding is one of:
- **CHOICE** — the code settled it differently on purpose → the design follows the code.
- **AHEAD** — the code has something the design never drew → add it to the design.
- **BEHIND** — the design has it, the code does not yet → kept in the design; build it.

## Already applied to Figma (2026-10-16)

- Messages wording everywhere (603 texts, screens + components + tablet + store + Handoff rule): "Чат" for the tab/title/button, "Чатлах" for the action, "мессеж" for one message ("Мессежээ бичнэ үү...", "Шинэ мессеж", "Анхны мессежээ бичнэ үү", "Мессеж ачаалж чадсангүй"); the admin broadcast field is "Мессеж". The Handoff rule now reads: Messages are “Чат” (one message: “мессеж”), never “Зурвас”.
- Category taxonomy = the seeded categories: Механизм түрээс→Машин техник, Машин түрээс→Тээврийн хэрэгсэл, Багаж түрээс→Багаж хэрэгсэл, Материал→Барилгын материал, Үйлдвэрлэл→Үйлдвэр, SOS үйлчилгээ→SOS Үйлчилгээ; families Материал, үйлдвэр→Материал, үйлдвэрлэл and Ажил, яаралтай→Ажлын байр.
- Desktop header (component, all variants): saved is a bookmark, not a heart.
- Listing action row: "Хадгалах" uses the bookmark; "Гомдол" → "Гомдол мэдүүлэх".
- New page **7 · As built**: the 172 screenshots, named by the frame each route implements.

## Open (needs a decision)

- Price units: the web prints "/ өдрөөр", "/ мото цагаар", "/ рейсээр"; Figma "/ өдөр", "/ цаг", "/ рейс". Not changed.

## Per screen (not yet redrawn)

## N5d Landing
- CHOICE header: search field in header + saved/chat icons (no nav links Хайх/Газрын зураг/Зар нэмэх/Тусламж) — BEHIND? nav links listed as known gap → keep design.
- BEHIND hero illustration, category card illustrations, footer links, stats "280 баталгаажсан нийтлэгч"/"~2 цаг дундаж хариу".
- CHOICE "Огноо сонгох" chip under the search bar (not inside).
## A1d Browse
- AHEAD/CHOICE rail: "Хэзээ хэрэгтэй вэ?" date field + hint; flat category list with counts (all 13); "Аймаг/Хот" select; "Шүүлт" button; page title "Зар хайх" + "1356 зар шинэ нь эхэндээ"; sort select "Хамгийн тохирох…".
- BEHIND filter chips row with clear-all, "Нэмэлт" toggles inline.
## B2d Listing detail
- CHOICE button "Чат"; report link "Гомдол мэдүүлэх"; booked note "10.19–10.23 захиалгатай" in price card; price unit "/ өдрөөр, оператортой".
- AHEAD seller card: service area line "Үйлчлэх бүс: …"; specs labels from category schema (Үйлдвэрлэгч/Брэнд, Загвар, Үйлдвэрлэсэн он, Даац / хүчин чадал, Оператортой).
- BEHIND breadcrumbs, thumbnail strip, reviews block on the listing, "312 үзэлт · нийтэлсэн" date line.
## E1d Provider home
- AHEAD notifications-off banner (that is E11d), task "N үнэлгээнд хариулаагүй", "Өдөр хаах" button under stats.
- CHOICE sidebar: Нүүр · Миний зар · Захиалга · Чат · Профайл (no "Бизнес"); task "2 хариулаагүй чат".
- BEHIND "Ирэх ажил" (upcoming jobs) card.
- CHOICE desktop header (all screens): saved = bookmark icon (Figma: heart); guest shows "Нэвтрэх" button; listing "Хадгалах" uses bookmark.
## N1d Sign in — BEHIND card, brand mark, live stats chip; web plain form under the app header (header shown on sign-in).
## B6d Job listing — CHOICE "Залгах" + "Чат"; AHEAD seller service area; BEHIND breadcrumbs, booking note, map preview, reviews.
## S1d SOS — CHOICE header "Ирэх хугацаагаар" sort label, single-column list, chips order (Бүгд, Дугуй засвар, Чирэлт, Аккумулятор, Шатахуун хүргэлт, Дуудлагын…); BEHIND availability/ETA/distance/rating line, hero art, 2-column.
- CHOICE signed-in header: bookmark · chat · bell · avatar (initial letter when no photo).
## I1d Chat — CHOICE title "Чат", listing card label "Энэ зарын талаар" with price on its own line, composer "Мессежээ бичнэ үү...", no camera button, booking step shown as centred system line "Захиалгын хүсэлт илгээлээ."; BEHIND reply-time subtitle under the name, unread badges, photo attach.
## U1d My bookings — CHOICE segmented tabs "Идэвхтэй · 2 / Өнгөрсөн · 1" (Figma underline tabs), status chip above title, booking note line (customer's note), phone row with "Чат" + "Залгах" (Figma dark phone button + Зурвас), "Цуцлах" as outlined button; BEHIND right-hand "how booking works" card, review-pending block.
## I5d Profile — CHOICE single column: phone card, Мэдэгдлүүд, Миний захиалга, notification toggles (Чат/Захиалга/Хадгалсан хайлт/Мэдээ, санал) with "notifications off" banner, Хэл select, Загвар segmented (Цайвар/Харанхуй/Систем), Тусламж, Нууцлал ба нөхцөл, Бүртгэл устгах row, Гарах button; BEHIND two-column profile+settings, name/avatar, provider entry rows.
- CHOICE taxonomy (data, seed = real): Механизм түрээс→Машин техник, Машин түрээс→Тээврийн хэрэгсэл, Багаж түрээс→Багаж хэрэгсэл, Материал→Барилгын материал, Үйлдвэрлэл→Үйлдвэр, SOS үйлчилгээ→SOS Үйлчилгээ; families Материал, үйлдвэр→Материал, үйлдвэрлэл, Ажил, яаралтай→Ажлын байр (SOS sits in Үйлчилгээ).
## E2d My listings — CHOICE quota block in right column with "Зар нэмэх" button, status chips "Нийтлэгдсэн/Ноорог/Татгалзсан", inline edit-refused banner row with "Засах"; tabs "Бүгд 20 · Нийтлэгдсэн 18 · Анхаарах 3 · Ноорог 1".
## E3d Booking requests — CHOICE segmented "Шинэ · 2 / Зөвшөөрсөн · 2 / Өнгөрсөн · 2", "Ажилтай өдрөө хаах" button at top, card: listing thumb+title+customer+dates+price, address/time/note lines, overlap warning, Зөвшөөрөх (orange) + Татгалзах; BEHIND right-hand calendar, customer avatar header.
## F1d Wizard 1 — CHOICE category list as two-column rows with chevrons grouped by family (no subcategory chips on this step), "Буцах" + "Дараах: үндсэн мэдээлэл"; BEHIND live preview column and checklist, draft-saved line.
## F2d Wizard 2 (edit) — AHEAD category fields from schema (Даац / хүчин чадал, Оператортой toggle) + "Нэмэлт мэдээлэл" group (Хүргэлттэй, Хамгийн бага түрээсийн хоног, Өдрийн доод мото цаг, Засвар үйлчилгээтэй, Түрээслээд худалдан авах), Тайлбар block on the same step; title "Зар засах" when editing; next button "Дараах: үнэ ба хугацаа".
## G3d Plan & billing — AHEAD "Онцлох байршуулалт · Сонгох" card, "Төлбөрийн түүх" with empty state, back link "Буцах", plan meter dated "2026.12.30 хүртэл", "Одоогийн" chip on the active plan.
## J10d Admin dashboard — matches; AHEAD pending badge on "Зарууд"; full 13-category bar list; broadcast form "Мессеж" (not "Зурвас") + Ангилал select.
## V1d Seller page — CHOICE single column: seller card with service area + full-width "Чатлах" primary; "Зарууд · N" as 2-column row cards (all listings); "Үнэлгээ · N" list with per-review "Гомдол мэдүүлэх" link and rules note; BEHIND left column About + reply time, "Бүх 21 үнэлгээ ›" link.
## C5d Saved — CHOICE segmented tabs "Зарууд · N / Хайлтууд · N"; saved items as horizontal row cards with filled orange heart.
## I3d Notifications — CHOICE empty state copy "Мэдэгдэл байхгүй байна / Зарын баталгаажуулалт болон шинэчлэлтүүд энд харагдана" (seed customer had none; list not compared).
## B1d Map — CHOICE map keeps the browse rail + title + sort/view toggle, count clusters, location-off banner, listing strip under the map; BEHIND list column beside the map with price pins.
## L1d/L2d/L6d/L5d Help, Privacy, Terms, 404 — match (L5d web is the listing-not-found variant "Зар олдсонгүй · Хайлт руу буцах").
## V2d All reviews — CHOICE own page (Figma: modal over the seller page), sort chips Шинэ/Өндөр оноо/Бага оноо, per-review "Гомдол мэдүүлэх".
## C8d Saved searches — matches (web seed empty).
## M1d Chat empty — copy "Зар дээрх "Чатлах" товчоор…" (Figma "Зурвас").
## L3d Account deletion — matches; CHOICE list marks with red ✕, buttons Бүртгэл устгах (red) then Буцах.
## N4d Become provider — guest sees the sign-in modal over it (state not comparable).
## E6d Performance — CHOICE title "Зарын үр дүн" + "60 хоног үлдсэн", 4 stat tiles (Үзэлт/Хадгалсан/Холбоо барьсан/Захиалгын хүсэлт), completeness ring card, action rows Засах/Онцлох/Зар устгах, "Зарыг харах" button; BEHIND header action buttons, booking list.
## E4d Block dates — CHOICE "Боломжит өдрүүд", listing chips incl. "Бүх зар (N)", info note, single calendar + disabled Хадгалах; BEHIND selection summary bar with orange Хадгалах.
## E16d Booking value — CHOICE month switcher "2026 оны 10-р сар" with arrows, card total, rows "listing · customer · dates".
## G4d Company — CHOICE title "Компани", sections Ерөнхий мэдээлэл (+Тухай), Үйлчлэх бүс (aimag chips), Холбоо барих (Утас, Вэбсайт, И-мэйл, Хаяг), Хуулийн мэдээлэл (Улсын бүртгэлийн дугаар, Татвар төлөгчийн дугаар); BEHIND live preview card, logo change.
## J5d Admin listings — CHOICE "Шалгах дараалал" master–detail queue as the listings page (Шинэ/Засвар/Бүгд), detail with Татгалзах/Зөвшөөрөх; Figma J5d is a table of all listings.
## J6d Users — CHOICE list rows (avatar initials, name, phone · role · date, chevron), filter chips Бүгд/Зар нийтлэгч/Зар хайгч/Админ; BEHIND table with plan select and delete.
## J11d User detail — matches; AHEAD plan form "Багц олгох / Багц цуцлах", featured grant with day chips, listings table.
## J14d/J16d Categories — match (labels from data); AHEAD icon grid picker, Tохиргоо with Нэгж select, Талбарууд table.
## J7d Analytics — CHOICE 7/30/90 segmented, 4 tiles, Хөрвөлт + Ангиллаар bars, Хайлтын дутагдал empty; BEHIND daily active chart, aimag table, client errors table.
## J4d Reports — CHOICE segmented Шийдвэрлээгүй/Шийдвэрлэсэн; (seed empty).
## J8d Admin profile — matches (single column).
