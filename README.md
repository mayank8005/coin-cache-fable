# 🪙 CoinCache

Self-hosted family expense tracker — a fast, keypad-first PWA where every family
member gets their own fully private space. Open these in a browser:

- **`README.html`** — product page: full feature list, security details, architecture decisions
- **`guide.html`** — user guide: recording, importing your old data, family accounts, installing as an app
- **`deploy.html`** — running locally and deploying to a VPS

## Quick start (VPS)

```sh
cp .env.example .env        # then set DB_PASSWORD and DOMAIN
docker compose up -d --build
```

Open your domain — the first visit shows a one-time setup page that creates the
admin account and seeds default categories. Add family members and import your
CSV history from **Settings**.

## Local development

```sh
npm install
npm test                                   # shared package unit tests
# needs a Postgres reachable via DATABASE_URL, e.g. the compose db:
DATABASE_URL=postgresql://... npm run dev
```

## Layout

- `apps/web` — Next.js 15 app (UI + server actions + Prisma schema)
- `packages/shared` — CSV import parser & default categories (unit-tested)
- `docker-compose.yml` — Postgres 16 + app + Caddy (automatic HTTPS)
- `scripts/backup.sh` — nightly `pg_dump` backup, keeps last 30
