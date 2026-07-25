#!/usr/bin/env bash
set -euo pipefail

run_id="$(date +%s)_$$"
container="cc-e2e-db-${run_id}"
database_name="coincache_e2e_${run_id}"
lock_dir="${TMPDIR:-/tmp}/coincache-e2e.lock"
lock_acquired=0

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  if [[ "$lock_acquired" == "1" ]]; then
    rm -f "$lock_dir/pid"
    rmdir "$lock_dir" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

acquire_lock() {
  if mkdir "$lock_dir" 2>/dev/null; then
    return 0
  fi

  local owner_pid=""
  if [[ -r "$lock_dir/pid" ]]; then
    IFS= read -r owner_pid < "$lock_dir/pid" || true
  fi
  if [[ "$owner_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$owner_pid" 2>/dev/null; then
    rm -f "$lock_dir/pid"
    rmdir "$lock_dir" >/dev/null 2>&1 || true
    mkdir "$lock_dir" 2>/dev/null && return 0
  fi

  return 1
}

if ! acquire_lock; then
  echo "Another CoinCache E2E run is already active. Wait for it to finish before retrying." >&2
  exit 1
fi
lock_acquired=1
printf '%s\n' "$$" > "$lock_dir/pid"

app_port="$(node scripts/find-free-port.mjs)"

docker run --detach --name "$container" \
  --env POSTGRES_USER=coincache \
  --env POSTGRES_PASSWORD=test \
  --env POSTGRES_DB="$database_name" \
  --publish 127.0.0.1::5432 \
  --tmpfs /var/lib/postgresql/data \
  postgres:16-alpine >/dev/null

database_binding="$(docker port "$container" 5432/tcp)"
database_port="${database_binding##*:}"
if [[ ! "$database_port" =~ ^[0-9]+$ ]]; then
  echo "Unable to determine the throwaway PostgreSQL host port." >&2
  exit 1
fi
database_url="postgresql://coincache:test@127.0.0.1:${database_port}/${database_name}"
echo "Using E2E container ${container}, database port ${database_port}, and app port ${app_port}."

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
