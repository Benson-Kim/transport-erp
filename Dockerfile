# Dependencies
# node:22 (#44): matches package.json engines (22.x) and CI (node:22).
FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./

COPY prisma ./prisma

RUN npm ci

RUN npx prisma generate


FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Set build-time env vars
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN npm run build


# Runner
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime dependencies for Puppeteer.
# DECISION (#44/#34): Chromium STAYS - puppeteer is the server-side PDF
# engine (src/lib/pdf/render.ts); PUPPETEER_EXECUTABLE_PATH pins the
# system browser and the bundled download stays skipped.
RUN apk add --no-cache \
ca-certificates \
    chromium \
    freetype \
    harfbuzz \
    nss \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Don't run as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Migration policy (#41/#44): single-replica default. Multi-replica
# deployments MUST set RUN_MIGRATIONS=false and run migrations ONCE via a
# MIGRATE_ONLY=true one-shot job (see docker-entrypoint.sh).
ENV RUN_MIGRATIONS=true

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma files for migrations at runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

# Copy entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# Readiness-gated health (#41): unhealthy until the DB is reachable and
# migrations are applied. busybox wget ships with alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]