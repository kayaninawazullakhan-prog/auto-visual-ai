# Scalability

How AUTO VISUAL AI scales from a single box to high throughput. The architecture
separates a **stateless web tier** (validate / persist / enqueue) from a
**stateful-but-elastic worker tier** (the heavy pipeline), connected only through
Postgres and Redis — so each tier scales on its own axis. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the system overview and
[DEPLOYMENT.md](DEPLOYMENT.md) for the concrete AWS mapping.

---

## 1. Stateless web tier — horizontal scaling

`apps/web` (Next.js 15) holds **no per-instance state**: sessions live in Clerk,
data in Postgres, queues in Redis, media in S3. That makes it trivially
horizontally scalable.

- Run **N identical containers** behind an **Application Load Balancer**; scale
  out on CPU / request latency / concurrency (ECS Fargate service auto-scaling).
- Requests are short: routes validate input, write to Postgres, and **enqueue**
  BullMQ jobs — they never block on FFmpeg, model inference, or rendering (see
  `pipeline.*` enqueue calls, e.g.
  [`apps/web/app/api/analyze/route.ts`](apps/web/app/api/analyze/route.ts)).
- Health: the ALB target group polls
  [`/api/health`](apps/web/app/api/health/route.ts) for readiness; unhealthy tasks
  are drained and replaced.
- Build for it: the web Dockerfile emits Next.js **standalone** output
  ([`docker/web.Dockerfile`](docker/web.Dockerfile)), keeping images small and
  cold-starts fast.

## 2. Worker tier — scale per queue

`apps/worker` (BullMQ) is where the cost and time live. Each pipeline stage is its
own **queue** (`extract-audio → transcribe → analyze → generate-assets →
build-timeline → subtitles → render → quality → export`), so stages scale
independently.

- **Scale out by queue depth.** Auto-scale the worker service on BullMQ
  `waiting` + `active` counts (publish them as CloudWatch metrics). Bursty stages
  (generation, render) get more replicas; cheap stages don't.
- **Right-size per workload.** Run separate worker deployments/instance types per
  queue class: CPU/GPU-heavy **render** workers vs. lightweight **analyze**
  workers that mostly await provider HTTP calls. The render image already bundles
  FFmpeg + Chromium/Remotion deps
  ([`docker/worker.Dockerfile`](docker/worker.Dockerfile)).
- **Concurrency knobs (env, validated in
  [`packages/config/src/env.ts`](packages/config/src/env.ts)):**
  - `WORKER_CONCURRENCY` — max simultaneous heavy jobs per worker process.
  - `REMOTION_CONCURRENCY` — parallelism inside a single Remotion render.
  - `IMAGE_OPTIONS_PER_SEGMENT` / `VIDEO_OPTIONS_PER_SEGMENT` — fan-out per
    segment (directly drives provider call volume and cost).
- **Idempotent + resumable.** Every stage keys off DB state
  ([ARCHITECTURE.md](ARCHITECTURE.md) §5), so retries and re-delivered jobs
  re-derive instead of duplicating — safe to scale aggressively and to use
  spot/interruptible capacity for render.

## 3. Provider rate limits & backpressure

Most heavy compute is **offloaded to third-party providers** (Whisper, Flux/SDXL,
Runway/Kling/Pika) through `@ava/ai`. The bottleneck becomes *their* rate limits,
not our CPU.

- Apply **BullMQ rate limiting** per queue (`limiter: { max, duration }`) sized to
  each provider's quota so we never trip 429s under load.
- Cap **per-provider concurrency** independently of `WORKER_CONCURRENCY` (e.g.
  many cheap analyze jobs but few concurrent video-generation calls).
- Use **exponential backoff + bounded retries** on transient provider failures
  (the Stripe client already sets `maxNetworkRetries`; mirror this for AI
  providers). Failed jobs land in a dead-letter / failed set for inspection.
- Swapping a provider is an env change (`IMAGE_PROVIDER`, `VIDEO_PROVIDER`,
  `WHISPER_PROVIDER`), so you can shift load between vendors to balance quota.

## 4. PostgreSQL (RDS) — read replicas + pooling

- **Connection pooling is mandatory at scale.** Many web/worker replicas × a
  Prisma pool each will exhaust Postgres connections. Put **PgBouncer**
  (transaction pooling) — or **RDS Proxy** — in front; point `DATABASE_URL` at the
  pooler. The Prisma client is already a per-process singleton
  ([`packages/db/src/index.ts`](packages/db/src/index.ts)) to avoid pool
  explosions on hot-reload.
- **Read replicas** for read-heavy paths (dashboards, project/asset listings,
  status polling). Keep writes on the primary; route heavy reads to replicas.
- **Index for tenant queries.** The schema already carries composite indexes for
  the common access patterns — e.g. `@@index([userId, status])` and
  `@@index([userId, createdAt])` on `Project`, plus per-status indexes on assets,
  renders, and jobs ([`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma)).
- Scale vertically first (instance class), then horizontally (replicas); consider
  partitioning/archival for the high-volume `Job` and `TranscriptSegment` tables
  as history grows.

## 5. Redis (ElastiCache) — queue backbone

- BullMQ runs entirely on Redis; use **ElastiCache for Redis** in prod. The
  `ioredis` client version is pinned via a root `package.json` override for
  predictable behavior across web + worker.
- Start single-node with a replica for HA; scale memory with job volume. Keep an
  eviction policy that won't drop queue state (`noeviction` for the queue
  instance), and separate caching workloads onto a different instance if added
  later.
- Redis throughput rarely bottlenecks before providers/DB do, but monitor memory
  and `connected_clients` as the worker fleet grows.

## 6. Media — S3 + CloudFront

- **S3** is effectively infinitely scalable for originals, generated assets,
  renders, and exports; uploads/downloads bypass the app via **presigned URLs**
  (`@ava/storage`), so bytes never flow through the web tier.
- **CloudFront** fronts delivery of finished media: global edge caching, lower
  latency, and far less origin/egress load. Configure long cache TTLs for
  immutable render/export objects (content-addressed keys).
- Lifecycle policies: transition intermediate artifacts to cheaper storage classes
  and expire stale temp objects to control storage cost.

## 7. Rendering — the elastic frontier

Rendering (Remotion + FFmpeg) is the most resource-intensive stage. Two scaling
strategies, selectable without touching the rest of the system:

- **Dedicated render workers** (current model): CPU/GPU-optimized worker instances
  pulling the `render` queue, with `REMOTION_CONCURRENCY` tuned per instance size.
  Use spot capacity (jobs are resumable) for cost.
- **Remotion Lambda / serverless fan-out:** burst rendering to many short-lived
  functions for spiky load with no idle fleet. Trades per-render cost for
  elasticity.
  Quality validation (the ≥`QUALITY_MIN_SCORE` gate) runs after render and can
  trigger a bounded re-render/upscale loop.

## 8. Cost controls

Scale and cost are the same conversation here because most spend is per-API-call
and per-render.

- **Credits before compute:** decrement `User.credits` / `Billing.creditsRemaining`
  *before* enqueueing paid jobs (`PLAN_CREDITS` in
  [`apps/web/lib/billing.ts`](apps/web/lib/billing.ts)) so usage can't outrun the
  plan.
- **Tune fan-out:** `IMAGE_OPTIONS_PER_SEGMENT` / `VIDEO_OPTIONS_PER_SEGMENT` are
  the biggest provider-cost levers — lower them for cheaper plans.
- **Scale to zero / to floor:** keep worker min-capacity low (or zero for
  serverless render) so idle periods cost nothing; let queue depth drive scale-out.
- **Right-size & spot:** match instance classes to queue class; use spot for
  resumable render/generation work.
- **Lifecycle media** in S3 (above) and cache aggressively at CloudFront to cut
  egress.
- **Budget alerts & per-tenant metering:** track provider spend per user (asset
  `meta` already carries provider cost/request-id) to spot abuse and inform plan
  pricing.

---

### Scaling summary

| Layer    | Service           | Scaling lever                                   |
|----------|-------------------|-------------------------------------------------|
| Web      | ECS Fargate + ALB | Replicas on CPU/latency (stateless)             |
| Worker   | ECS / EC2 per queue | Replicas on BullMQ depth; concurrency env knobs |
| Render   | GPU/CPU workers or Remotion Lambda | Instance size + `REMOTION_CONCURRENCY` / fan-out |
| Postgres | RDS               | Vertical → read replicas; PgBouncer/RDS Proxy   |
| Redis    | ElastiCache       | Memory + replica for HA                          |
| Media    | S3 + CloudFront   | Effectively unbounded; presigned, edge-cached   |
| Providers| 3rd-party AI      | BullMQ rate limit + per-provider concurrency    |
