# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# ---------- build ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cd apps/web && npx prisma generate
RUN npm run build -w apps/web

# ---------- runtime ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app

# Next standalone server (includes pruned node_modules)
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public ./apps/web/public

# Prisma CLI in an isolated install so `migrate deploy` runs on boot
# (the standalone bundle only traces runtime deps, not the CLI's).
# bcryptjs + pg power the emergency password-reset tool.
WORKDIR /opt/prisma
COPY --from=builder /app/apps/web/prisma ./prisma
RUN npm init -y >/dev/null 2>&1 && npm install --no-save --no-audit --no-fund prisma@6 bcryptjs@3 pg@8 >/dev/null
COPY docker/tools /opt/tools

WORKDIR /app
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER app
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
