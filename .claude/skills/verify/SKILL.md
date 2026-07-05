---
name: verify
description: Build, run, and drive CoinCache locally against a throwaway database to verify changes end-to-end.
---

# Verifying CoinCache changes

The production docker-compose stack (db/web/caddy, port 80) holds the user's
real data and runs a pre-built image — never point a verification at it.
Use a throwaway Postgres + `next dev` instead.

## Recipe

1. **Throwaway DB** (tmpfs, port 5433 to avoid the real stack's internal 5432):
   ```bash
   docker run -d --name cc-verify-db -e POSTGRES_USER=coincache -e POSTGRES_PASSWORD=test \
     -e POSTGRES_DB=coincache -p 5433:5432 --tmpfs /var/lib/postgresql/data postgres:16-alpine
   ```
2. **Migrate** (from `apps/web/`):
   ```bash
   DATABASE_URL=postgresql://coincache:test@localhost:5433/coincache npx prisma migrate deploy
   ```
3. **Dev server** (from `apps/web/`, background):
   ```bash
   DATABASE_URL=postgresql://coincache:test@localhost:5433/coincache TZ=Asia/Kolkata npx next dev -p 3100
   ```
4. **Drive with Playwright** — `npm i playwright` in the scratchpad and launch with
   `channel: "chrome"` (uses installed Google Chrome; the cached ms-playwright
   chromium builds may not match the npm version). Viewport 430×932 (user's
   iPhone 16 Pro Max).
5. **Teardown**: kill the dev server, `docker rm -f cc-verify-db`.

## Driving the app

- Empty DB → `/` redirects to `/setup`; fill `name`/`email`/`password`, submit.
  Creates an ADMIN user, default categories (see `packages/shared/src/defaults.ts`
  for the exact order), and a Cash account, then lands on the dashboard.
- Seed data fast with SQL via `docker exec cc-verify-db psql -U coincache -d coincache -c ...`.
  Collapse SQL to one line (multiline through `-c` breaks psql). `Record` needs
  explicit `"createdAt"`/`"updatedAt"`; enum casts like `'EXPENSE'::"EntryType"`.
  Reset between runs with `TRUNCATE "User" CASCADE;`.
- Dashboard FABs: `[aria-label="Add expense"]` / `[aria-label="Add income"]`.
  In the record dialog: keypad digits are buttons; then the "Choose category"
  button shows the category grid (names in `button span.truncate`). Picking a
  category saves immediately and closes the dialog.
- Category-name selectors collide with dashboard entry rows behind the dialog —
  scope to `button:has(span.truncate)`.
- Settings page lists accounts, categories, and users with the same
  `ul.divide-y li` markup; filter out "Cash" and rows containing "@" to get
  just categories.
