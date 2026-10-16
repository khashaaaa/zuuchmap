# design/

A copy of the Zuuchmap design that does not depend on a Figma subscription, and a picture of the product as it is actually built.

| Folder | What |
|---|---|
| `figma/screens/<page>/` | Every screen frame of the Figma file, light and dark, cropped 1:1 (`<code>-<name>[-dark].webp`). Codes are the Figma frame codes (`B2` phone, `B2d` desktop, `T2` tablet). |
| `figma/boards/` | The non-screen pages whole: cover, brand guide and export assets, foundations, icons, illustrations (in-app, store, listing photos, people, map tiles), the component batches, patterns, the **Handoff** build spec, the store board. |
| `figma/frames.tsv` | Every frame: page section, name, position and size in the Figma file. |
| `as-built/` | The live web app, every route, as each role sees it (guest, customer, provider, admin), desktop 1440 and phone 390, light and dark. Named by the Figma frame each one implements; `index.json` maps file → route. |
| `drift.md` | Screen by screen: what the code does differently from the design and which way it should be settled. |
| `penpot/` | The Figma file converted for Penpot (self-hosted, see below). |

Tokens (colours, spacing, radius, motion, type, elevation) are not here: they live in `packages/tokens/src/figma.json` and build into both clients. Fonts are in `packages/tokens/fonts/`.

## Sources

- **Figma** (source of truth while the subscription lasts): https://www.figma.com/design/c9ds9j1tM48XCIvCDrIQKc
- **Penpot** (local, free, no subscription): `~/penpot` on the desktop — `docker compose -p penpot up -d`, then http://localhost:9001 (credentials in `~/.penpot.env`). Import `penpot/*.penpot` via Projects → Import.

## Refreshing

Screens and boards are rendered from Figma section by section (1×) and cropped with `frames.tsv`; the as-built shots come from a headless-Chrome sweep of the running web app with the dev seed. Re-run both after the design or the product changes.
