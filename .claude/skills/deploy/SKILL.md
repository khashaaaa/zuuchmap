---
name: deploy
description: Deploy Zuuchmap to production (zuuchmap.com VPS) — push repos, backup DB, pull+build engine and web, run migrations, restart pm2, smoke test. Use when asked to deploy, release, or update the live site.
---

# Deploy Zuuchmap to production

One command, after committing:

```bash
.claude/skills/deploy/deploy.sh            # pushes monorepo master, then deploys engine+web
.claude/skills/deploy/deploy.sh --no-push  # deploys what is already on GitHub
```

Credentials live in `~/.zuuchmap-deploy.env` (chmod 600, never committed):
`VPS_HOST/USER/PASS`, `GH_USER/TOKEN`. (`PG_*` entries there are STALE since the
2026-08-18 rotation and no longer used — both scripts read DB credentials from
the engine's `production.env` on the server itself.) If missing, ask the user to recreate it.

## Server facts (verified 2026-08-16 — monorepo)

- Repo is now a single monorepo: `github.com/<GH_USER>/zuuchmap` (`zuuchmap_app`/`zuuchmap_engine`/`zuuchmap_web` as subdirectories, no submodules). `GH_TOKEN` must have push access to this repo, not the old three.
- VPS `ubuntu@158.69.212.75` — password auth only (no SSH keys); use paramiko, `sshpass` is not installed locally.
- The VPS keeps one persistent monorepo checkout at `~/zuuchmap-mono` (fetched/reset each deploy). `/var/www/zuuchmap_engine` and `/var/www/zuuchmap_web` are **no longer their own git repos** — each deploy `rsync`s the matching subdirectory from `~/zuuchmap-mono` into them (`--delete`, excluding whatever that app's own `.gitignore` excludes, so `node_modules`/`dist`/`uploads`/etc. on the server are left alone).
- Engine: `/var/www/zuuchmap_engine`, runs under **pm2** (`ecosystem.config.js`, app name `zuuchmap_engine`, port 8282). pm2 startup is systemd-enabled (`pm2-ubuntu`) — always `pm2 save` after changing the process list.
- Web: `/var/www/zuuchmap_web` — nginx serves `dist/` directly; a build IS the deploy, no restart needed.
- Nginx: `/etc/nginx/sites-available/zuuchmap` proxies `/engine` → `localhost:8282`; SSL via letsencrypt.
- Node is **nvm-only**: prefix every remote command with
  `export PATH=$HOME/.nvm/versions/node/v24.11.1/bin:$PATH` (non-interactive SSH has no nvm).
- Postgres: host `158.69.212.75`, db `zuuchmap` (creds in the env file). Migrations must run with
  `NODE_ENV=production npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts`
  — the package.json `migration:run` script hardcodes NODE_ENV=development. `migrationsRun: true` also runs them at boot, but run explicitly first for visibility.
- App (`zuuchmap_app`) is mobile-only — lives in the monorepo but not deployed to the VPS.

## Suspending the VPS / rebuilding on a new one

Everything except four things is recoverable from GitHub + Cloudflare R2. Before
suspending, run:

```bash
.claude/skills/deploy/snapshot.sh
```

It writes `~/zuuchmap-vps-bundle/` (chmod 700, secrets inside, never commit):
fresh `pg_dump`, `engine.production.env`, web `.env*`, `ecosystem.config.js`,
`nginx-zuuchmap.conf`, `server-facts.txt`. Verified 2026-08-21. Images are all
on R2 (`/var/www/zuuchmap_engine/uploads` is empty); SSL certs are not copied —
reissue with certbot on the new box.

**Rebuild sequence on a fresh Ubuntu 24.04 VPS** (versions from server-facts.txt:
node v24.11.1 via nvm, Postgres 16, nginx 1.24):

1. `apt install nginx postgresql-16 rsync` · install nvm → `nvm install 24.11.1` · `npm i -g pm2`
2. Postgres: create role + db matching `engine.production.env` (`PG_USER`/`PG_PWD`/`PG_NAME`),
   then `zcat zuuchmap_suspend_*.sql.gz | psql -U <PG_USER> -d <PG_NAME>`
3. Layout: clone monorepo to `~/zuuchmap-mono`; rsync `zuuchmap_engine/`→`/var/www/zuuchmap_engine`,
   `zuuchmap_web/`→`/var/www/zuuchmap_web` (deploy.sh steps 3/6 do exactly this)
4. Restore `engine.production.env` → `config/variables/`, `web.env*` → web root.
   `ecosystem.config.js` comes from the repo now (no longer carries DB creds —
   the app reads `PG_*` from `production.env`). Update `PG_HOST` in that env file
   if Postgres isn't localhost.
5. Engine: `npm install && npm run build`, explicit `NODE_ENV=production migration:run`
   (brings the restored DB up to current schema), `pm2 start ecosystem.config.js && pm2 save`,
   `pm2 startup` (systemd)
6. Web: `npm install && npm run build`
7. nginx: restore `nginx-zuuchmap.conf` → `sites-available/zuuchmap`, symlink to
   `sites-enabled`, point DNS A record at the new IP, `certbot --nginx -d zuuchmap.com`
8. Update `VPS_HOST` in `~/.zuuchmap-deploy.env`; run `deploy.sh --no-push` to confirm
   the pipeline works end-to-end

**Optional — scale the engine past 1 instance (needs Redis):** `apt install
redis-server`, uncomment `REDIS_URL=redis://127.0.0.1:6379` in `production.env`,
set `PM2_INSTANCES=<n>` (or in the pm2 env), `pm2 reload ecosystem.config.js`.
That flips throttler storage, cache invalidation and Socket.io broadcasts onto
Redis so N workers stay consistent. Without Redis, keep `instances: 1` — the
engine runs fine single-node (in-memory), it just can't be horizontally scaled.
Redis also removes the throttler's unbounded-memory behaviour under a
high-cardinality IP flood (verified: 40k distinct IPs → engine RSS flat at
~220MB, counts off-heap in Redis).

**Running on localhost meanwhile:** local dev needs nothing from the VPS —
`npm run dev:engine` + `dev:web` use the local Postgres and
`config/variables/development.env`. For the mobile app against a local engine,
point `API_BASE_URL` in `zuuchmap_app/src/config/api.config.js` at
`http://<your-LAN-IP>:8282/engine` (remember to revert before a release build).
While the VPS is suspended, anything pointing at `https://zuuchmap.com` (deployed
web, installed apps, verify.mn callback) is down — that's expected.

## Gotchas

- **Always back up the DB before migrations** (the script does this; backups land in `~/zuuchmap_backup_*.sql.gz` on the VPS).
- The engine caches categories in-process for 1h — restart pm2 after any direct SQL edit to `category_schema`.
- Rollback: `cd ~/zuuchmap-mono && git checkout <prev>`, re-run the two `rsync` commands (engine/web, see deploy.sh steps 3 and 6) to push that commit's content into `/var/www/...`, then rebuild + `pm2 restart` (or `migration:revert` per migration, same NODE_ENV=production form, or restore the DB dump).
- Auth is verify.mn Mobile-Originated SMS. `production.env` must carry `VERIFY_MN_API_KEY` and `PUBLIC_ENGINE_URL=https://zuuchmap.com/engine` — the callback is unreachable without the latter, and verification silently fails. `OTP_OVERRIDE` is gone; the old `/auth/otp/*` endpoints now return 410.
