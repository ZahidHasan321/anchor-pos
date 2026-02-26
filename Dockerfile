# Build Stage
FROM node:25-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY pnpm-lock.yaml package.json ./

# Install dependencies
RUN pnpm install

# Copy project files
COPY . .

# Build the SvelteKit app
ENV BUILD_TARGET=node
RUN pnpm build

# Runtime Stage
FROM node:25-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy build output and dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "build/index.js"]
