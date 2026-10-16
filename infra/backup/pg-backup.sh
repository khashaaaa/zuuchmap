#!/usr/bin/env bash
# Nightly: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE from env, BACKUP_DIR optional.
# cron: 15 3 * * * /var/www/zuuchmap/infra/backup/pg-backup.sh
set -euo pipefail

: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/zuuchmap}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/${PGDATABASE}-$(date +%F).sql.gz"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

pg_dump --no-owner --format=plain "$PGDATABASE" | gzip -9 > "$tmp"
mv "$tmp" "$out"

find "$BACKUP_DIR" -maxdepth 1 -name "${PGDATABASE}-*.sql.gz" -mtime "+$KEEP_DAYS" -delete
echo "backup ok: $out"
