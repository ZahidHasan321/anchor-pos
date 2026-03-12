FROM node:22-slim AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-lock.yaml package.json ./
RUN pnpm install
COPY . .
ENV BUILD_TARGET=node
# VITE_ vars are inlined into the client bundle at build time
ENV VITE_POWERSYNC_URL=https://powersync.anchorshop.cloud
RUN pnpm build

FROM node:22-slim
WORKDIR /app
RUN npm install -g pnpm && \
    addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm add drizzle-kit typescript
COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
USER appuser
EXPOSE 3000
CMD ["node", "build/index.js"]
