#!/bin/bash
# OrphanGive Postgres backup (Session 15b2).
#
# Runs from the Hostinger VPS via root crontab — see footer of
# docs/cron-setup.md for the recommended entry.
#
# Strategy: pg_dump runs INSIDE the og-database container (so we
# don't need a separate Postgres client on the VPS host), output
# is streamed through gzip on-the-fly to the host-side backup dir,
# then a retention pass deletes files older than 14 days.
#
# IMPORTANT: backups stay on the same VPS as the source database.
# If the VPS dies, backups die with it. v1.5 work should add a
# remote-storage push step (S3 / Hostinger Object Storage /
# Backblaze B2) — see TODO in the footer.

set -e

BACKUP_DIR="/opt/orphangive/backups"
RETENTION_DAYS=14
CONTAINER_NAME="og-database"
DB_USER="directus"
DB_NAME="directus"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +%Y-%m-%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/og_db_$TIMESTAMP.sql.gz"

# Dump from the running Postgres container, gzip on the fly.
# Using `set -o pipefail` ensures a pg_dump failure (e.g. container
# not running) propagates through the pipe and the script exits
# non-zero, so the cron log surfaces it.
set -o pipefail
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "$BACKUP_FILE"

# Sanity check: the file should exist AND be non-empty. A 0-byte
# file means the dump streamed nothing before the pipe closed.
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[$(date -u +%FT%TZ)] BACKUP FAILED: $BACKUP_FILE is empty or missing"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Retention pass — delete files older than N days. mtime is the
# right signal here (created_at would require stat-parsing).
find "$BACKUP_DIR" -name "og_db_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date -u +%FT%TZ)] Backup complete: $BACKUP_FILE ($SIZE)"

# TODO (v1.5): push $BACKUP_FILE to remote storage. Sketch:
#   aws s3 cp "$BACKUP_FILE" "s3://og-backups/$(basename "$BACKUP_FILE")"
# Or for Hostinger Object Storage / Backblaze B2:
#   rclone copy "$BACKUP_FILE" remote:og-backups/
# Without remote push, a VPS-level failure (disk crash, host
# compromise, accidental rm -rf) loses both source DB and backups.
