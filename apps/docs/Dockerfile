# syntax=docker.io/docker/dockerfile:1

# Build context must be the monorepo root:
#   docker build -f apps/docs/Dockerfile -t omniscribe-docs .

# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
WORKDIR /app

# Copy workspace config and all package.json files needed for install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/docs/package.json apps/docs/
COPY packages/shared/package.json packages/shared/
COPY packages/plugin-api/package.json packages/plugin-api/

RUN pnpm install --frozen-lockfile --filter @omniscribe/docs...

# ─── Stage 2: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
WORKDIR /app

COPY --from=deps /app/ ./
COPY packages/shared/ packages/shared/
COPY packages/plugin-api/ packages/plugin-api/
COPY apps/docs/ apps/docs/

# Build shared packages (needed for TypeDoc)
RUN pnpm --filter @omniscribe/shared build && \
    pnpm --filter @omniscribe/plugin-api build

# Generate API docs and build Next.js
RUN cd apps/docs && pnpm generate:api && pnpm run build

# ─── Stage 3: Production runner ─────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/apps/docs/public ./apps/docs/public

# Copy standalone output (preserves monorepo directory structure)
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/.next/static ./apps/docs/.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "apps/docs/server.js"]
