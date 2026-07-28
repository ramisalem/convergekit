FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/mcp/package.json packages/mcp/
COPY packages/queues/package.json packages/queues/
COPY packages/types/package.json packages/types/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/web/ apps/web/
COPY packages/ packages/

# Next.js inlines NEXT_PUBLIC_* into the client bundle at build time, so these
# have to be present here and not only at runtime.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEB_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL}

RUN pnpm --filter @convergekit/web... build

FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/packages ./packages

EXPOSE 3000

ARG IMAGE_BUILD_CACHE_BUST
LABEL dev.convergekit.image-build-cache-bust="${IMAGE_BUILD_CACHE_BUST}"

CMD ["pnpm", "--filter", "@convergekit/web", "start", "--hostname", "0.0.0.0", "--port", "3000"]
