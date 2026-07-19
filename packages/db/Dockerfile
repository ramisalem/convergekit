FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY packages/types/package.json packages/types/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/ packages/

ARG IMAGE_BUILD_CACHE_BUST
LABEL dev.convergekit.image-build-cache-bust="${IMAGE_BUILD_CACHE_BUST}"

CMD ["pnpm", "--filter", "@convergekit/db", "db:deploy"]
