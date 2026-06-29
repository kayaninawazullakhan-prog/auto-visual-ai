# Deployment

Production deployment guide for AUTO VISUAL AI on AWS. The app is two long-running
services (`apps/web`, `apps/worker`) plus Postgres, Redis, and S3. The reference
target is **ECS Fargate** for both services; EC2 is a drop-in alternative for the
worker if you want GPU instances for rendering.

For the *why* behind these choices see [ARCHITECTURE.md](ARCHITECTURE.md),
[SCALABILITY.md](SCALABILITY.md), and [SECURITY.md](SECURITY.md).

---

## 1. Reference architecture (AWS)

```
                 Route 53  →  ACM (TLS)
                     │
            ┌────────▼─────────┐         ┌──────────────────────┐
   users ──▶│  CloudFront      │────────▶│  S3 (media bucket)    │  originals,
            │  (media + app)   │  signed │  block public access  │  assets,
            └────────┬─────────┘  URLs   └──────────────────────┘  renders, exports
                     │  app traffic
            ┌────────▼─────────┐
            │       ALB        │  HTTPS, /api/health checks
            └────────┬─────────┘
                     │
      ┌──────────────▼───────────────┐        ┌────────────────────────────┐
      │  ECS Fargate · web service   │        │  ECS Fargate · worker svc   │
      │  (N tasks, stateless)        │        │  (scale per BullMQ queue;   │
      │  image: ECR/ava-web          │        │   GPU/CPU; image: ava-worker)│
      └───────┬───────────────┬──────┘        └───────┬──────────────┬──────┘
              │               │                       │              │
       ┌──────▼─────┐   ┌─────▼──────┐         ┌──────▼─────┐  ┌─────▼──────┐
       │ RDS (Pg)   │   │ ElastiCache│◀────────┤  (same     │  │ Secrets    │
       │ + RDS Proxy│   │  (Redis)   │  jobs   │   Redis/DB)│  │ Manager/SSM│
       └────────────┘   └────────────┘         └────────────┘  └────────────┘
```

- **Networking:** one VPC, public subnets for ALB + NAT, **private subnets** for
  ECS tasks, RDS, and ElastiCache. Security groups: ALB→web:3000, web/worker→RDS:5432,
  web/worker→Redis:6379. RDS and Redis are **not** publicly reachable.
- **Images:** built from [`docker/web.Dockerfile`](docker/web.Dockerfile) and
  [`docker/worker.Dockerfile`](docker/worker.Dockerfile), pushed to **ECR**.
- **Config/secrets:** injected from **Secrets Manager / SSM** as task-definition
  secrets (never baked into images — see [SECURITY.md](SECURITY.md) §4).

## 2. Provisioned resources checklist

| Resource | Service | Notes |
|----------|---------|-------|
| Container registry | **ECR** | `ava-web`, `ava-worker` repos |
| Web service | **ECS Fargate** | behind ALB, auto-scale on CPU/latency |
| Worker service | **ECS Fargate** (or EC2/GPU) | auto-scale on queue depth |
| Load balancer | **ALB** | HTTPS (ACM cert), health check `GET /api/health` |
| Database | **RDS PostgreSQL 16** | Multi-AZ; **RDS Proxy** or PgBouncer for pooling |
| Cache/queue | **ElastiCache for Redis 7** | replica for HA; `noeviction` |
| Object storage | **S3** | block public access; lifecycle rules |
| CDN | **CloudFront** | media delivery (+ optional app), signed URLs |
| Secrets | **Secrets Manager / SSM** | all keys below |
| DNS / TLS | **Route 53 + ACM** | domain + certificate |
| Logs/metrics | **CloudWatch** | task logs, alarms, BullMQ-depth metric |

## 3. Environment variable checklist

Validated by zod in [`packages/config/src/env.ts`](packages/config/src/env.ts);
full annotated list in [`.env.example`](.env.example). **Bold = required to boot.**

**Core / infra**
- **`DATABASE_URL`** — point at **RDS Proxy / PgBouncer** endpoint, not RDS
  directly (see [SCALABILITY.md](SCALABILITY.md) §4).
- **`REDIS_URL`** — ElastiCache primary endpoint.
- `NODE_ENV=production`, `APP_URL=https://<your-domain>` (used for Stripe
  success/cancel + portal return URLs), `INTERNAL_API_URL` (worker→web callbacks).

**Auth (Clerk)** — `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_WEBHOOK_SECRET`.

**Billing (Stripe)** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`,
`STRIPE_PRICE_BUSINESS`.

**Storage (S3)** — `AWS_REGION`, `S3_BUCKET`, `S3_PUBLIC_URL` (CloudFront host).
Prefer an **ECS task role** over static `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY`.

**Providers (optional, enable per feature)** — `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `FAL_KEY`, `REPLICATE_API_TOKEN`, `RUNWAY_API_KEY`,
`KLING_ACCESS_KEY`/`KLING_SECRET_KEY`, `PIKA_API_KEY`, plus the `*_PROVIDER` and
model selectors.

**Tuning** — `WORKER_CONCURRENCY`, `REMOTION_CONCURRENCY`, `QUALITY_MIN_SCORE`,
`IMAGE_OPTIONS_PER_SEGMENT`, `VIDEO_OPTIONS_PER_SEGMENT`.

> The app boots with only the two required URLs; each provider is checked at call
> time and fails *that feature* with a `503` if its key is missing. Set the
> Clerk/Stripe/S3 keys before exposing the app to real users.

## 4. Build & push images

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"

# Build from the repo root (Dockerfiles expect the full monorepo as context)
docker build -f docker/web.Dockerfile   -t "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/ava-web:$GIT_SHA"   .
docker build -f docker/worker.Dockerfile -t "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/ava-worker:$GIT_SHA" .

docker push "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/ava-web:$GIT_SHA"
docker push "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/ava-worker:$GIT_SHA"
```

Both Dockerfiles run `pnpm --filter @ava/db db:generate` during build, so the
Prisma client is baked into the image. The web image produces Next.js standalone
output and runs as a non-root user; the worker image bundles FFmpeg + Chromium
libraries for Remotion.

## 5. Database migrations

Prisma migrations are **never run automatically** by the app or containers — run
them as an explicit, gated step in your release pipeline using the committed
migration history.

```bash
# Apply all pending migrations to the production database.
# Run once per release, BEFORE shifting traffic to new tasks.
DATABASE_URL="postgresql://<prod-direct-or-proxy>" \
  pnpm --filter @ava/db db:deploy        # → prisma migrate deploy
```

Run this from a CI job, a one-off ECS task using the `ava-web` image, or a bastion
— anything with network access to RDS and the prod `DATABASE_URL`. Notes:

- `db:deploy` maps to `prisma migrate deploy` (apply-only; no schema drift, no
  prompts) — the correct command for production. Do **not** use `db:push` or
  `db:migrate` (dev workflows) against prod.
- Migrations should be **backward-compatible** with the currently-running version
  so you can migrate before deploying (expand/contract pattern) and roll back app
  tasks without breaking the schema.
- Via Compose (single-host):
  `docker compose -f docker-compose.prod.yml run --rm web pnpm --filter @ava/db db:deploy`.

## 6. Step-by-step deploy

1. **Provision infra** (§2) — VPC/subnets/SGs, RDS (+Proxy), ElastiCache, S3,
   CloudFront, ALB, ACM cert, ECR repos, ECS cluster. (Use Terraform/CDK; keep it
   in version control.)
2. **Store secrets** (§3) in Secrets Manager/SSM; reference them from the ECS task
   definitions. Attach an S3-scoped task role.
3. **Build & push** the `ava-web` / `ava-worker` images to ECR (§4).
4. **Run migrations** against RDS with `db:deploy` (§5).
5. **Create/Update ECS services:**
   - `web` — desired count ≥ 2, port 3000, registered with the ALB target group,
     health check `GET /api/health`, CPU-based auto-scaling.
   - `worker` — no load balancer; auto-scale on a published **BullMQ queue-depth**
     CloudWatch metric. Optionally split into per-queue services (render on GPU).
6. **Wire webhooks** in the provider dashboards to the public URLs:
   - Clerk → `https://<domain>/api/webhooks/clerk` (set `CLERK_WEBHOOK_SECRET`).
   - Stripe → `https://<domain>/api/webhooks/stripe` for
     `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted` (set `STRIPE_WEBHOOK_SECRET`). Create the
     three subscription **Products/Prices** and set `STRIPE_PRICE_*`.
7. **Smoke test:** `GET /api/health` returns `200` with the expected `features`
   flags all `true`; sign up → upload → run the pipeline → checkout → confirm the
   Stripe webhook updates `Billing`/`User`.
8. **Observability:** confirm CloudWatch logs/alarms (5xx rate, ALB latency, RDS
   connections/CPU, Redis memory, queue depth, DLQ size). Wire Sentry (see
   [ROADMAP.md](ROADMAP.md)).

## 7. Releasing updates

- Build a new image tagged with the git SHA, push to ECR.
- Run backward-compatible migrations **first** (§5).
- Update the ECS service to the new task definition — Fargate does a **rolling**
  deploy (new tasks must pass `/api/health` before old tasks drain). Roll back by
  redeploying the previous task definition.
- Roll `web` and `worker` together unless a change is explicitly one-sided; both
  share the `@ava/*` packages and DB schema.

## 8. CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push/PR:
`pnpm install --frozen-lockfile` → `db:generate` → `pnpm -r typecheck` →
`pnpm build` (with dummy `DATABASE_URL`/`REDIS_URL` so config validation passes).
Extend it with a deploy job (on tags / `main`) that builds + pushes images to ECR,
runs `db:deploy`, and updates the ECS services. Use GitHub OIDC → an AWS deploy
role instead of long-lived AWS keys.

## 9. Self-hosted / single-host alternative

For staging or small deploys, [`docker-compose.prod.yml`](docker-compose.prod.yml)
runs web + worker + Postgres + Redis on one host from the same Dockerfiles:

```bash
cp .env.example .env   # set DATABASE_URL/REDIS_URL to the postgres/redis services
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm web pnpm --filter @ava/db db:deploy
```

Bring your own TLS termination (e.g. a reverse proxy) and use real S3 +
CloudFront for media even in this mode.
