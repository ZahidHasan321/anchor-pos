FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends bzip2 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV BUILD_TARGET=node
# VITE_ vars are inlined into the client bundle at build time
ENV VITE_POWERSYNC_URL=https://powersync.anchorshop.cloud
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9 --activate && \
    addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
# drizzle-kit and typescript are needed for db:push at deploy time
RUN pnpm install --prod --frozen-lockfile && pnpm add drizzle-kit typescript
COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
# Only copy schema file needed by drizzle-kit push (not the entire src/)
COPY --from=builder /app/src/lib/server/db/schema.ts ./src/lib/server/db/schema.ts
COPY --from=builder /app/scripts ./scripts
USER appuser
EXPOSE 3000
CMD ["node", "build/index.js"]
