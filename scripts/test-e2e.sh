#!/usr/bin/env bash
set -euo pipefail

container="cc-e2e-db"
run_id="$(date +%s)_$$"
database_name="coincache_e2e_${run_id}"
database_url="postgresql://coincache:test@127.0.0.1:5433/${database_name}"
app_port="$(node scripts/find-free-port.mjs)"
echo "Using E2E database ${database_name} and app port ${app_port}."

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
docker run --detach --name "$container" \
  --env POSTGRES_USER=coincache \
  --env POSTGRES_PASSWORD=test \
  --env POSTGRES_DB="$database_name" \
  --publish 127.0.0.1:5433:5432 \
  --tmpfs /var/lib/postgresql/data \
  postgres:16-alpine >/dev/null

ready=0
for _ in {1..30}; do
  if docker exec "$container" pg_isready -U coincache -d "$database_name" >/dev/null 2>&1; then
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

E2E_DATABASE_URL="$database_url" \
E2E_ALLOW_DESTRUCTIVE_RESET="$database_name" \
E2E_APP_PORT="$app_port" \
npx playwright test "$@"
