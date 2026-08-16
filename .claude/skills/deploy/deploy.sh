#!/usr/bin/env bash
# Zuuchmap production deploy — verified 2026-07-18.
# Usage:
#   ./deploy.sh            # push local commits, then deploy engine + web on the VPS
#   ./deploy.sh --no-push  # deploy whatever is already on GitHub master
# Credentials come from ~/.zuuchmap-deploy.env (never committed).
set -euo pipefail
source ~/.zuuchmap-deploy.env

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
NO_PUSH="${1:-}"

vps() {
  python3 - "$1" <<PYEOF
import sys, paramiko
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('$VPS_HOST', username='$VPS_USER', password='$VPS_PASS', timeout=15)
_, out, err = c.exec_command(sys.argv[1], timeout=900)
o = out.read().decode(); e = err.read().decode(); code = out.channel.recv_exit_status()
print(o, end='')
if e.strip(): print('[stderr]', e[:2000], file=sys.stderr)
sys.exit(code)
PYEOF
}

if [ "$NO_PUSH" != "--no-push" ]; then
  for repo in zuuchmap_engine zuuchmap_web zuuchmap_app; do
    if [ -n "$(git -C "$ROOT/$repo" status --porcelain)" ]; then
      echo "!! $repo has uncommitted changes — commit them first (or run with --no-push)"; exit 1
    fi
    git -C "$ROOT/$repo" push "https://$GH_USER:$GH_TOKEN@github.com/$GH_USER/$repo.git" master
  done
fi

STAMP=$(date +%Y%m%d_%H%M)
echo "== 1/5 DB backup =="
vps "PGPASSWORD=$PG_PASS pg_dump -h $PG_HOST -U $PG_USER $PG_DB | gzip > ~/zuuchmap_backup_$STAMP.sql.gz && ls -la ~/zuuchmap_backup_$STAMP.sql.gz"
# Retention: keep only the 10 most recent backups so these don't accumulate forever.
vps "cd ~ && ls -t zuuchmap_backup_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -v"

NODEPATH='export PATH=$HOME/.nvm/versions/node/v24.11.1/bin:$PATH'

echo "== 2/5 Engine: pull, install, build =="
vps "$NODEPATH; cd /var/www/zuuchmap_engine && git pull https://$GH_USER:$GH_TOKEN@github.com/$GH_USER/zuuchmap_engine.git master && npm install --no-audit --no-fund 2>&1 | tail -1 && npm run build 2>&1 | tail -1"

echo "== 3/5 Engine: migrations (production) =="
vps "$NODEPATH; cd /var/www/zuuchmap_engine && NODE_ENV=production npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts 2>&1 | grep -E 'executed|pending|No migrations' | tail -6"

echo "== 4/5 Engine: restart via pm2 =="
vps "$NODEPATH; pm2 restart zuuchmap_engine 2>/dev/null || (cd /var/www/zuuchmap_engine && pm2 start ecosystem.config.js); pm2 save >/dev/null; sleep 4; pm2 status | grep zuuchmap"

echo "== 5/5 Web: pull + build (nginx serves dist directly) =="
vps "$NODEPATH; cd /var/www/zuuchmap_web && git pull https://$GH_USER:$GH_TOKEN@github.com/$GH_USER/zuuchmap_web.git master && npm install --no-audit --no-fund 2>&1 | tail -1 && npm run build 2>&1 | grep -E 'built|error'"

echo "== Smoke test =="
curl -s -o /dev/null -w "API  https://zuuchmap.com/engine/posts/categories/all -> HTTP %{http_code}\n" https://zuuchmap.com/engine/posts/categories/all
curl -s -o /dev/null -w "WEB  https://zuuchmap.com -> HTTP %{http_code}\n" https://zuuchmap.com
echo "Deploy complete. Backup: ~/zuuchmap_backup_$STAMP.sql.gz on the VPS."
