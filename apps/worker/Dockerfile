# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy manifests for dependency install (layer-cached)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/
COPY packages/types/package.json packages/types/
COPY packages/db/package.json packages/db/
COPY packages/queues/package.json packages/queues/
COPY packages/ai/package.json packages/ai/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.base.json ./
COPY apps/worker/ apps/worker/
COPY packages/ packages/

RUN pnpm --filter @convergekit/worker... build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache git
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/packages ./packages

ARG IMAGE_BUILD_CACHE_BUST
LABEL dev.convergekit.image-build-cache-bust="${IMAGE_BUILD_CACHE_BUST}"

CMD ["pnpm", "--filter", "@convergekit/worker", "exec", "tsx", "src/index.ts"]
