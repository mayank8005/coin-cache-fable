#!/usr/bin/env bash
set -euo pipefail

container="cc-e2e-db"
database_url="postgresql://coincache:test@127.0.0.1:5433/coincache"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
docker run --detach --name "$container" \
  --env POSTGRES_USER=coincache \
  --env POSTGRES_PASSWORD=test \
  --env POSTGRES_DB=coincache \
  --publish 127.0.0.1:5433:5432 \
  --tmpfs /var/lib/postgresql/data \
  postgres:16-alpine >/dev/null

ready=0
for _ in {1..30}; do
  if docker exec "$container" pg_isready -U coincache -d coincache >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "Timed out waiting for the throwaway PostgreSQL database." >&2
  exit 1
fi

(
  cd apps/web
  DATABASE_URL="$database_url" npx prisma migrate deploy
)

DATABASE_URL="$database_url" npx playwright test "$@"
