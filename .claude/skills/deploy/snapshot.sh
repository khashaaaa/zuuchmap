#!/usr/bin/env bash
# Zuuchmap VPS snapshot — capture everything the VPS holds that GitHub does not,
# so the server can be suspended and rebuilt elsewhere.
#
# Produces ~/zuuchmap-vps-bundle/ (chmod 700, SECRETS INSIDE — never commit):
#   zuuchmap_suspend_<stamp>.sql.gz   fresh full pg_dump of the prod DB
#   engine.production.env             /var/www/zuuchmap_engine/config/variables/production.env
#   engine.development.env.vpscopy    ditto development.env (server copy, for reference)
#   web.env / web.env.production      /var/www/zuuchmap_web/.env*
#   ecosystem.config.js               pm2 process definition
#   nginx-zuuchmap.conf               /etc/nginx/sites-available/zuuchmap
#   server-facts.txt                  node/pm2/cron/nginx/pg versions + process list
#
# Usage: .claude/skills/deploy/snapshot.sh
set -euo pipefail
source ~/.zuuchmap-deploy.env

BUNDLE=~/zuuchmap-vps-bundle
mkdir -p "$BUNDLE" && chmod 700 "$BUNDLE"
STAMP=$(date +%Y%m%d_%H%M)

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

fetch() {
  python3 - "$1" "$2" <<PYEOF
import sys, paramiko
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('$VPS_HOST', username='$VPS_USER', password='$VPS_PASS', timeout=15)
s = c.open_sftp(); s.get(sys.argv[1], sys.argv[2]); s.close(); c.close()
print('fetched', sys.argv[2])
PYEOF
}

echo "== 1/3 Fresh DB dump on the VPS =="
# Credentials come from the engine's own production.env ON the server — the
# local deploy env's PG_PASS went stale after the 2026-08-18 rotation.
DUMP="/home/ubuntu/zuuchmap_suspend_$STAMP.sql.gz"
vps "set -o pipefail; set -a; . /var/www/zuuchmap_engine/config/variables/production.env; set +a; PGPASSWORD=\"\$PG_PWD\" pg_dump -h localhost -U \"\$PG_USER\" -d \"\$PG_NAME\" | gzip > $DUMP && ls -la $DUMP"

echo "== 2/3 Server facts =="
vps 'export PATH=$HOME/.nvm/versions/node/v24.11.1/bin:$PATH; echo "node: $(node -v)"; pm2 ls; echo "cron:"; crontab -l 2>&1; nginx -v 2>&1; pg_dump --version' > "$BUNDLE/server-facts.txt"
cat "$BUNDLE/server-facts.txt"

echo "== 3/3 Fetch files =="
fetch "$DUMP"                                                            "$BUNDLE/zuuchmap_suspend_$STAMP.sql.gz"
fetch /var/www/zuuchmap_engine/config/variables/production.env           "$BUNDLE/engine.production.env"
fetch /var/www/zuuchmap_engine/config/variables/development.env          "$BUNDLE/engine.development.env.vpscopy"
fetch /var/www/zuuchmap_web/.env                                         "$BUNDLE/web.env"
fetch /var/www/zuuchmap_web/.env.production                              "$BUNDLE/web.env.production"
fetch /var/www/zuuchmap_engine/ecosystem.config.js                       "$BUNDLE/ecosystem.config.js"
fetch /etc/nginx/sites-available/zuuchmap                                "$BUNDLE/nginx-zuuchmap.conf"

chmod 600 "$BUNDLE"/*
echo
echo "Bundle complete:"
ls -la "$BUNDLE"
echo
echo "Sanity: dump should end with PostgreSQL database dump complete —"
zcat "$BUNDLE/zuuchmap_suspend_$STAMP.sql.gz" | tail -1
