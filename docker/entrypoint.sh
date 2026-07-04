#!/bin/sh
set -e

echo "[coincache] applying database migrations..."
cd /opt/prisma
i=0
until node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma; do
  i=$((i + 1))
  if [ "$i" -ge 10 ]; then
    echo "[coincache] database not reachable after 10 attempts, giving up" >&2
    exit 1
  fi
  echo "[coincache] database not ready, retrying in 3s ($i/10)..."
  sleep 3
done

echo "[coincache] starting server"
cd /app
exec node apps/web/server.js
