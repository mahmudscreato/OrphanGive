# Session 15b1 — production Docker image for the OrphanGive
# Next.js app. Multi-stage build:
#
#   1. deps     — installs npm dependencies (cached when
#                 package*.json doesn't change)
#   2. builder  — compiles + outputs .next/standalone/* per
#                 next.config.ts `output: 'standalone'`
#   3. runner   — minimal alpine image with non-root user;
#                 runs the standalone bundle on :3000
#
# Build context expects the full repo. Build-time env vars
# that affect compilation (e.g. NEXT_PUBLIC_*) must be supplied
# via build args or baked into .env.production at build time —
# see the deployment instructions in the 15b1 session report.
#
# Image is intentionally Node 22 alpine for a small surface;
# all heavyweight tools (turbopack cache, build artifacts) stay
# in the builder stage and are discarded.

# ─── Stage 1: dependencies ───────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: builder ────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: runtime ────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# wget is alpine-default for the HEALTHCHECK below; no extra
# package install needed.

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone output already includes a minimal node_modules tree.
# Copy public/ separately because Next doesn't include it in the
# standalone bundle, and .next/static for client-side chunks.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Container-level health probe — Docker marks the container
# unhealthy if /api/health stops responding. The reverse proxy
# on the VPS can use this signal to gate traffic.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
