#!/bin/sh
# Runs backup.sh daily at ~02:00 Asia/Riyadh (23:00 UTC). Used by the `backup` compose service.
set -eu
while true; do
  now=$(date -u +%s)
  target=$(date -u -d "$(date -u +%Y-%m-%d) 23:00:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))
  sh /scripts/backup.sh || echo "backup FAILED at $(date -u)" >&2
done
