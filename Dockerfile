# ================================================================
# JobNavi Multi-Stage Dockerfile (Web & Playwright Worker)
# ================================================================

# --- Stage 1: Dependencies ---
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Stage 2: Builder ---
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# --- Stage 3: Runner (Production Web & Worker) ---
FROM mcr.microsoft.com/playwright:v1.44.0-jammy AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Copy package files and node modules
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Install tsx for worker daemon execution
RUN npm install -g tsx

# Copy built application and required assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/middleware.ts ./

EXPOSE 3000

CMD ["npm", "start"]
