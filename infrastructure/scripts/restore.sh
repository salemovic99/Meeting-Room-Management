#!/bin/sh
# Restore a backup INTO A TARGET DATABASE (default: a scratch DB, for periodic restore tests).
#   docker compose run --rm -e PGDATABASE=mrm_restore_test backup sh /scripts/restore.sh /backups/mrm_X.dump.enc
# Restoring over production: stop backend first, then set PGDATABASE=mrm explicitly.
set -eu
FILE="${1:?usage: restore.sh <backup file>}"
TARGET="${PGDATABASE:?set PGDATABASE to the database to restore into}"
TMP="/tmp/restore.dump"

case "$FILE" in
  *.enc)
    command -v openssl >/dev/null 2>&1 || apk add --no-cache openssl >/dev/null
    openssl enc -d -aes-256-cbc -pbkdf2 -in "$FILE" -out "$TMP" -pass env:BACKUP_ENCRYPTION_KEY ;;
  *) cp "$FILE" "$TMP" ;;
esac

PGDATABASE=postgres psql -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null
PGDATABASE=postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | grep -q 1 \
  || PGDATABASE=postgres createdb "$TARGET"
pg_restore --clean --if-exists --no-owner --dbname="$TARGET" "$TMP"
rm -f "$TMP"
echo "restored $FILE into $TARGET"
PGDATABASE="$TARGET" psql -tc "SELECT count(*) || ' bookings' FROM bookings"
