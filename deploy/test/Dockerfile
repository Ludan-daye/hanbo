FROM node:22-bookworm-slim

ARG DEBIAN_MIRROR
RUN test -n "$DEBIAN_MIRROR" \
    && sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile --filter @construction/api... --filter construction-site-personnel-management-system

COPY packages/domain packages/domain
COPY apps/api/src apps/api/src
COPY --chown=node:node apps/api/prisma apps/api/prisma
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json apps/api/
RUN pnpm --filter @construction/api prisma:generate \
    && pnpm --filter @construction/domain build \
    && pnpm --filter @construction/api build

ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
