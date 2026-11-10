#!/bin/sh
# One PostgreSQL backup: pg_dump (custom format) -> optional AES-256 encryption -> retention prune.
# Uses PG* env vars. Output: /backups/mrm_<UTC timestamp>.dump[.enc]
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/mrm_${STAMP}.dump"

mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --file="$OUT.tmp"
mv "$OUT.tmp" "$OUT"

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  if ! command -v openssl >/dev/null 2>&1; then apk add --no-cache openssl >/dev/null; fi
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$OUT" -out "$OUT.enc" -pass env:BACKUP_ENCRYPTION_KEY
  rm -f "$OUT"
  OUT="$OUT.enc"
fi

echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"
find "$BACKUP_DIR" -name 'mrm_*.dump*' -type f -mtime "+$RETENTION_DAYS" -print -delete
