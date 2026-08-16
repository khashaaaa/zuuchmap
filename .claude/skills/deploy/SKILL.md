---
name: deploy
description: Deploy Zuuchmap to production (zuuchmap.com VPS) — push repos, backup DB, pull+build engine and web, run migrations, restart pm2, smoke test. Use when asked to deploy, release, or update the live site.
---

# Deploy Zuuchmap to production

One command, after committing:

```bash
.claude/skills/deploy/deploy.sh            # pushes master of all 3 repos, then deploys engine+web
.claude/skills/deploy/deploy.sh --no-push  # deploys what is already on GitHub
```

Credentials live in `~/.zuuchmap-deploy.env` (chmod 600, never committed):
`VPS_HOST/USER/PASS`, `GH_USER/TOKEN`, `PG_HOST/USER/PASS/DB`. If missing, ask the user to recreate it.

## Server facts (verified 2026-07-18)

- VPS `ubuntu@158.69.212.75` — password auth only (no SSH keys); use paramiko, `sshpass` is not installed locally.
- Engine: `/var/www/zuuchmap_engine`, runs under **pm2** (`ecosystem.config.js`, app name `zuuchmap_engine`, port 8282). pm2 startup is systemd-enabled (`pm2-ubuntu`) — always `pm2 save` after changing the process list.
- Web: `/var/www/zuuchmap_web` — nginx serves `dist/` directly; a build IS the deploy, no restart needed.
- Nginx: `/etc/nginx/sites-available/zuuchmap` proxies `/engine` → `localhost:8282`; SSL via letsencrypt.
- Node is **nvm-only**: prefix every remote command with
  `export PATH=$HOME/.nvm/versions/node/v24.11.1/bin:$PATH` (non-interactive SSH has no nvm).
- Postgres: host `158.69.212.75`, db `zuuchmap` (creds in the env file). Migrations must run with
  `NODE_ENV=production npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts`
  — the package.json `migration:run` script hardcodes NODE_ENV=development. `migrationsRun: true` also runs them at boot, but run explicitly first for visibility.
- App (`zuuchmap_app`) is mobile-only — pushed to GitHub but not deployed to the VPS.

## Gotchas

- **Always back up the DB before migrations** (the script does this; backups land in `~/zuuchmap_backup_*.sql.gz` on the VPS).
- The engine caches categories in-process for 1h — restart pm2 after any direct SQL edit to `category_schema`.
- Rollback: `git -C /var/www/zuuchmap_engine checkout <prev>` + `migration:revert` per migration (same NODE_ENV=production form), or restore the dump; then rebuild + `pm2 restart`.
- Prod uses `OTP_OVERRIDE` in `config/variables/production.env` — login code is static until real SMS lands.
