#!/bin/sh
# Nightly Postgres backup. Add to crontab on the VPS:
#   0 2 * * * /path/to/coincache/scripts/backup.sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP=$(date +%Y-%m-%d_%H%M)
docker compose exec -T db pg_dump -U coincache coincache | gzip > "backups/coincache-$STAMP.sql.gz"
# Keep the last 30 backups.
ls -1t backups/coincache-*.sql.gz | tail -n +31 | xargs -r rm --
echo "Backup written: backups/coincache-$STAMP.sql.gz"
