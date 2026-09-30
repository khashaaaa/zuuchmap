#!/usr/bin/env bash
# Zuuchmap production deploy — verified 2026-08-16 (monorepo).
# Usage:
#   ./deploy.sh            # push local monorepo, then deploy engine + web on the VPS
#   ./deploy.sh --no-push  # deploy whatever is already on GitHub master
# Credentials come from ~/.zuuchmap-deploy.env (never committed).
set -euo pipefail
source ~/.zuuchmap-deploy.env

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
NO_PUSH="${1:-}"
MONO_URL="https://$GH_USER:$GH_TOKEN@github.com/$GH_USER/zuuchmap.git"

vps() {
  python3 - "$1" <<PYEOF
import sys, paramiko
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('$VPS_HOST', username='$VPS_USER', password='$VPS_PASS', timeout=15)
# pipefail: most steps pipe their output through tail/grep to keep the log
# short, and without it the step's exit status was tail's — a failed build or
# migration reported success and the deploy carried on to restart pm2.
_, out, err = c.exec_command('set -o pipefail; ' + sys.argv[1], timeout=900)
o = out.read().decode(); e = err.read().decode(); code = out.channel.recv_exit_status()
print(o, end='')
if e.strip(): print('[stderr]', e[:2000], file=sys.stderr)
sys.exit(code)
PYEOF
}

# Values duplicated across engine/web/app (socket events, category colours, the
# palette, location codes, price units, shared translations, the post-title
# chain) are only held together by convention. Check them before anything
# reaches production — a drifted copy ships as two different products.
echo "== 0/6 cross-repo sync check =="
node "$ROOT/scripts/check-sync.js"

if [ "$NO_PUSH" != "--no-push" ]; then
  if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
    echo "!! Working tree has uncommitted changes — commit them first (or run with --no-push)"; exit 1
  fi
  git -C "$ROOT" push "$MONO_URL" master
fi

STAMP=$(date +%Y%m%d_%H%M)
echo "== 1/6 DB backup =="
# Credentials from the engine's production.env ON the server — the local
# PG_PASS went stale after the 2026-08-18 rotation and TCP auth fails with it.
vps "set -o pipefail; set -a; . /var/www/zuuchmap_engine/config/variables/production.env; set +a; PGPASSWORD=\"\$PG_PWD\" pg_dump -h localhost -U \"\$PG_USER\" -d \"\$PG_NAME\" | gzip > ~/zuuchmap_backup_$STAMP.sql.gz && ls -la ~/zuuchmap_backup_$STAMP.sql.gz"
# Retention: keep only the 10 most recent backups so these don't accumulate forever.
vps "cd ~ && ls -t zuuchmap_backup_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -v"

NODEPATH='export PATH=$HOME/.nvm/versions/node/v24.11.1/bin:$PATH'

echo "== 2/6 Sync monorepo checkout (~/zuuchmap-mono) =="
vps "test -d ~/zuuchmap-mono/.git && (cd ~/zuuchmap-mono && git fetch origin master && git reset --hard origin/master) || git clone $MONO_URL ~/zuuchmap-mono"

echo "== 3/6 Engine: sync from monorepo, install, build =="
vps "rm -rf /var/www/zuuchmap_engine/.git; rsync -a --delete --exclude .git --exclude-from=~/zuuchmap-mono/zuuchmap_engine/.gitignore ~/zuuchmap-mono/zuuchmap_engine/ /var/www/zuuchmap_engine/"
vps "$NODEPATH; cd /var/www/zuuchmap_engine && npm install --no-audit --no-fund 2>&1 | tail -1 && npm run build 2>&1 | tail -3"

echo "== 4/6 Engine: migrations (production) =="
vps "$NODEPATH; cd /var/www/zuuchmap_engine && NODE_ENV=production npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts 2>&1 | tail -6"

echo "== 5/6 Engine: restart via pm2 =="
vps "$NODEPATH; pm2 restart zuuchmap_engine 2>/dev/null || (cd /var/www/zuuchmap_engine && pm2 start ecosystem.config.js); pm2 save >/dev/null; sleep 4; pm2 status | grep zuuchmap"

echo "== 6/6 Web: sync from monorepo, install, build (nginx serves dist directly) =="
vps "rm -rf /var/www/zuuchmap_web/.git; rsync -a --delete --exclude .git --exclude-from=~/zuuchmap-mono/zuuchmap_web/.gitignore ~/zuuchmap-mono/zuuchmap_web/ /var/www/zuuchmap_web/"
# Built beside the served directory and copied over it, never into it: Vite
# empties its outDir first, which left the live site without assets for the
# length of the build — and for good if the build failed. Copying without
# --delete also keeps the previous release's hashed chunks, so a tab opened
# before the deploy can still load the lazy route it asks for next. Chunks
# older than two weeks are pruned.
vps "$NODEPATH; cd /var/www/zuuchmap_web && npm install --no-audit --no-fund 2>&1 | tail -1 && npx vite build --outDir dist.next --emptyOutDir 2>&1 | tail -3 && mkdir -p dist && rsync -a dist.next/ dist/ && rm -rf dist.next && find dist/assets -type f -mtime +14 -delete"

echo "== Smoke test =="
# Fails the deploy rather than printing a 502 above "Deploy complete".
smoke() {
  local code; code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$2" || true)
  echo "$1  $2 -> HTTP $code"
  [ "$code" = "200" ] || { echo "!! $1 smoke test failed — the release is live but not answering"; exit 1; }
}
smoke API https://zuuchmap.com/engine/health/ready
smoke API https://zuuchmap.com/engine/posts/categories/all
smoke WEB https://zuuchmap.com
echo "Deploy complete. Backup: ~/zuuchmap_backup_$STAMP.sql.gz on the VPS."
