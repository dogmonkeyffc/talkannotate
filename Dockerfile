FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
ENV CI=true
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production
ENV PORT=3000
ENV TALKANNOTATE_DATA_DIR=/app/data
ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --prod --frozen-lockfile --filter @talkannotate/server...

COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/public ./apps/server/public

RUN mkdir -p /app/data/markdown /app/data/versions /app/data/exports

EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
