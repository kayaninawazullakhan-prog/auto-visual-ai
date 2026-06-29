# --- AUTO VISUAL AI · worker (BullMQ pipeline) -------------------------------
# Includes FFmpeg + Chromium dependencies for Remotion rendering. Full build
# wiring lands with the worker in Phase 1; this is the production image contract.

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# System deps: FFmpeg for media, plus the libraries Chromium/Remotion needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates fonts-liberation fonts-noto-color-emoji \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/render/package.json packages/render/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ava/db db:generate
RUN pnpm --filter @ava/worker build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app /app
WORKDIR /app/apps/worker
# Run via tsx so pnpm's symlinked workspace deps resolve naturally at runtime.
CMD ["pnpm", "start"]
