#!/usr/bin/env bash
# Zuuchmap backup restore drill.
#
# deploy.sh takes a pg_dump before every deploy and keeps the ten most recent,
# but nothing had ever restored one. An unverified dump is not a backup — it is
# a file that is *probably* a backup, and the moment you find out is the worst
# possible moment to find out.
#
# This restores the newest dump into a scratch database on the VPS, checks that
# the tables that matter came back with rows in them, and drops the scratch
# database again. The production database is never touched: everything happens
# in `zuuchmap_restore_drill`, which is created and dropped inside this script.
#
# Usage:
#   ./restore-drill.sh                 # newest backup
#   ./restore-drill.sh zuuchmap_backup_20260827_0130.sql.gz
#
# Run it after any change to the backup step, and on a schedule you can live
# with — monthly is enough to catch a dump that silently started failing.
set -euo pipefail
source ~/.zuuchmap-deploy.env

DUMP="${1:-}"
DRILL_DB="zuuchmap_restore_drill"

vps() {
  python3 - "$1" <<PYEOF
import sys, paramiko
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('$VPS_HOST', username='$VPS_USER', password='$VPS_PASS', timeout=15)
_, out, err = c.exec_command(sys.argv[1], timeout=1800)
o = out.read().decode(); e = err.read().decode(); code = out.channel.recv_exit_status()
print(o, end='')
if e.strip(): print('[stderr]', e[:4000], file=sys.stderr)
sys.exit(code)
PYEOF
}

# The engine's own env file is the only source of live credentials — PG_PASS in
# the deploy env went stale after the 2026-08-18 rotation, so read PG_PWD here
# the same way the backup step does.
ENVLOAD='set -a; . /var/www/zuuchmap_engine/config/variables/production.env; set +a'

echo "== 1/5 pick a dump =="
if [ -z "$DUMP" ]; then
  DUMP=$(vps "cd ~ && ls -t zuuchmap_backup_*.sql.gz 2>/dev/null | head -1" | tr -d '\r\n')
fi
if [ -z "$DUMP" ]; then
  echo "!! No backup found on the VPS. Run deploy.sh (step 1) first."; exit 1
fi
echo "Using: $DUMP"
vps "ls -la ~/$DUMP"

# A dump that gunzip cannot read is worthless, and finding that out before
# creating a database keeps the failure cheap and unambiguous.
echo "== 2/5 verify the archive is intact =="
vps "gzip -t ~/$DUMP && echo 'gzip integrity OK'"

echo "== 3/5 restore into $DRILL_DB =="
vps "$ENVLOAD; export PGPASSWORD=\"\$PG_PWD\";
     psql -h localhost -U \"\$PG_USER\" -d postgres -c 'DROP DATABASE IF EXISTS $DRILL_DB' &&
     psql -h localhost -U \"\$PG_USER\" -d postgres -c 'CREATE DATABASE $DRILL_DB' &&
     gunzip -c ~/$DUMP | psql -h localhost -U \"\$PG_USER\" -d $DRILL_DB -v ON_ERROR_STOP=1 -q &&
     echo 'restore completed without error'"

echo "== 4/5 check the restored data =="
# Row counts, not just "the restore exited 0": a dump can restore cleanly and
# still be empty if the backup step ran against the wrong database.
vps "$ENVLOAD; export PGPASSWORD=\"\$PG_PWD\";
     psql -h localhost -U \"\$PG_USER\" -d $DRILL_DB -At -F' ' -c \"
       SELECT 'user', count(*) FROM \\\"user\\\"
       UNION ALL SELECT 'post', count(*) FROM post
       UNION ALL SELECT 'category_schema', count(*) FROM category_schema
       UNION ALL SELECT 'booking', count(*) FROM booking
       UNION ALL SELECT 'migrations', count(*) FROM migrations
       ORDER BY 1\" &&
     psql -h localhost -U \"\$PG_USER\" -d $DRILL_DB -At -c \"
       SELECT CASE WHEN (SELECT count(*) FROM post) > 0
                    AND (SELECT count(*) FROM \\\"user\\\") > 0
                    AND (SELECT count(*) FROM category_schema) > 0
                   THEN 'DRILL PASSED — the backup restores to a usable database'
                   ELSE 'DRILL FAILED — restored database is missing core rows' END\""

echo "== 5/5 drop the scratch database =="
vps "$ENVLOAD; export PGPASSWORD=\"\$PG_PWD\";
     psql -h localhost -U \"\$PG_USER\" -d postgres -c 'DROP DATABASE IF EXISTS $DRILL_DB'"

echo
echo "Restore drill complete for $DUMP."
echo "If step 4 printed DRILL FAILED, the backup is not usable — fix step 1/6 of deploy.sh before the next deploy."
