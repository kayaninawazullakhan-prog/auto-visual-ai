# Security

How AUTO VISUAL AI protects user data, money, and infrastructure. This documents
what is implemented today and the hardening recommended before / shortly after
going to production.

---

## 1. Authentication & Session Management

- **Provider:** [Clerk](https://clerk.com) issues and validates sessions. The web
  app reads the session server-side via `@clerk/nextjs/server` (`auth()`,
  `currentUser()`) — never trusting client-supplied identity.
- **Single resolution point:** every API route resolves the caller through
  `requireUser()` in [`apps/web/lib/auth.ts`](apps/web/lib/auth.ts), which maps
  the Clerk identity to our `User` row (upsert on `clerkId`). Routes never read
  `userId` from the request body or query.
- **Fail-closed in production:** if Clerk is not configured, `requireUser()`
  throws `401` when `NODE_ENV=production`. The seeded demo-user fallback only
  applies in non-production so the pipeline is testable before auth keys exist.
- **Feature gating:** `getFeatures().auth` (in
  [`packages/config/src/features.ts`](packages/config/src/features.ts)) reports
  whether auth is wired, derived from `CLERK_SECRET_KEY` +
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

## 2. Authorization (tenant isolation)

- **Everything is scoped by `userId`.** Resource lookups go through
  `requireProject()` in [`apps/web/lib/guards.ts`](apps/web/lib/guards.ts), which
  queries `prisma.project.findFirst({ where: { id, userId } })` and throws **404**
  (not 403) when the project belongs to someone else — we don't leak the
  existence of other tenants' data.
- **No implicit ownership.** All child resources (videos, transcripts, assets,
  renders, exports, approvals) are reached via a project the user already owns, so
  the ownership check happens once at the boundary.
- **Cascade deletes** (`onDelete: Cascade` throughout
  [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma)) ensure a
  user's data is fully removed when the user (or a Clerk `user.deleted` webhook)
  deletes the account.

## 3. Webhook signature verification

All inbound webhooks verify signatures against the **raw request body** before
acting — the body is read with `req.text()` and never parsed to JSON first
(parsing would break the signature).

- **Clerk** — [`apps/web/app/api/webhooks/clerk/route.ts`](apps/web/app/api/webhooks/clerk/route.ts)
  verifies the Svix signature (`svix-id` / `svix-timestamp` / `svix-signature`)
  using `CLERK_WEBHOOK_SECRET`. Missing/invalid signature → `400`. Keeps the
  `User` table in sync (create / update / delete).
- **Stripe** — [`apps/web/app/api/webhooks/stripe/route.ts`](apps/web/app/api/webhooks/stripe/route.ts)
  verifies with `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`.
  Both webhook routes pin `export const runtime = "nodejs"` and
  `dynamic = "force-dynamic"` so the raw body and Node crypto are available and
  responses are never cached.
- Webhooks are **not authenticated by Clerk** (they have no user session) — the
  signature *is* the authentication. They return `503` if their secret is unset.

## 4. Secrets handling

- **Source of truth:** all secrets are validated by zod in
  [`packages/config/src/env.ts`](packages/config/src/env.ts) via `loadEnv()`.
  Only `DATABASE_URL` and `REDIS_URL` are required to boot; every provider/API
  key is optional and checked at call time (`getFeatures()`), so a missing key
  fails one feature with a typed `MissingProviderKeyError` (→ `503`) rather than
  crashing the app.
- **No secrets in the image or VCS.** `.env` is git-ignored (see
  [`.gitignore`](.gitignore)) and excluded from Docker build context via
  [`.dockerignore`](.dockerignore). Containers receive config at runtime
  (`env_file` locally; **AWS Secrets Manager / SSM Parameter Store** in prod — see
  [DEPLOYMENT.md](DEPLOYMENT.md)).
- **DB-overlay settings (important caveat).** The Settings page persists
  UI-entered provider keys to the `Setting` table
  ([`packages/db/src/settings.ts`](packages/db/src/settings.ts)) and overlays them
  onto `process.env` at runtime (`setOverrides` / `applyOverrides` in `env.ts`).
  These rows are **currently stored in plaintext** — acceptable for local/dev
  convenience, **NOT** for production. Before storing third-party keys in a shared
  prod DB:
  - encrypt values at rest (envelope encryption with **AWS KMS**, or
    `pgcrypto`), decrypting only in-process;
  - restrict the settings UI to admins;
  - prefer Secrets Manager over the DB overlay for the highest-value keys.
  This is tracked in [ROADMAP.md](ROADMAP.md) → *Hardening · Encryption at rest*.
- **Least-privilege IAM.** The S3 credentials used by `@ava/storage` should be a
  dedicated IAM principal limited to the one bucket and the actions used
  (`PutObject` / `GetObject` for presign). In ECS, prefer a task role over static
  `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

## 5. Object storage — presigned, short-TTL URLs

- Clients never receive long-lived bucket credentials. Uploads use **presigned
  PUT** URLs and downloads use **presigned GET** URLs minted server-side by
  `@ava/storage`.
- Download links are short-lived: e.g.
  [`apps/web/app/api/exports/route.ts`](apps/web/app/api/exports/route.ts) signs
  export URLs with a **3600s** TTL (`presignDownload(key, 3600)`) and only after
  `requireProject()` confirms ownership.
- The S3 bucket should **block all public access**; public delivery of finished
  media goes through **CloudFront** (optionally with signed URLs/cookies), not
  direct public-read objects.

## 6. Input validation

- Request bodies are parsed and validated with **zod** via `parseBody(req, schema)`
  in [`apps/web/lib/api.ts`](apps/web/lib/api.ts). A `ZodError` is mapped to a
  structured **422** with field-level details; invalid JSON → **400**.
- Enum inputs (e.g. the billing `plan`) are constrained to the Prisma enum values
  at the schema level, so unknown plans are rejected before any Stripe call.
- The central `route()` wrapper guarantees consistent error → HTTP mapping and
  prevents stack traces / internals from leaking (unknown errors → generic
  **500**).

## 7. Rate limiting & credit checks (abuse / cost control)

- **Credits are the spend gate.** Paid pipeline work (generation, render, export)
  is gated on `User.credits` / `Billing.creditsRemaining`. Credits are granted per
  plan and refreshed on each Stripe billing event in the webhook
  (`PLAN_CREDITS` in [`apps/web/lib/billing.ts`](apps/web/lib/billing.ts)). Check
  and decrement credits **before enqueueing** provider jobs so a caller can't run
  up unbounded third-party cost.
- **Rate limiting (recommended next).** Add per-user / per-IP limits in front of
  the expensive mutating routes (`/api/analyze`, `/api/generate-assets`,
  `/api/render`, `/api/billing/checkout`) and the webhook endpoints. A Redis-backed
  limiter (we already run Redis for BullMQ) or the ALB/WAF rate rules are both
  good fits. Tracked in [ROADMAP.md](ROADMAP.md) → *Hardening · Rate limiting*.
- **Idempotency.** Pipeline jobs are idempotent and keyed off DB state (see
  [ARCHITECTURE.md](ARCHITECTURE.md) §5), so a retried/duplicate webhook or job
  reconciles rather than double-charging or duplicating work. The Stripe webhook
  upserts Billing by `userId`, making redelivered events safe to re-process.

## 8. Transport & headers

- Terminate **TLS** at the ALB / CloudFront; redirect HTTP→HTTPS. Internal
  service-to-service traffic stays within the VPC/private subnets.
- Recommended response hardening for `apps/web` (via `next.config` headers or the
  edge): HSTS, `X-Content-Type-Options: nosniff`, a restrictive
  `Content-Security-Policy`, and `Referrer-Policy`. Clerk provides CSRF-safe
  session handling for authenticated requests.

## 9. Dependencies & supply chain

- **Reproducible installs.** CI installs with `pnpm install --frozen-lockfile`
  ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)); the committed
  `pnpm-lock.yaml` pins the full dependency graph. The root `package.json` pins an
  `ioredis` override to keep the BullMQ client version consistent.
- **Recommended additions:** enable **Dependabot** (or Renovate) for dependency
  and GitHub Actions updates, run `pnpm audit` in CI (gated on high/critical), and
  pin third-party GitHub Actions to commit SHAs. Generate an SBOM for releases.
- **Pinned runtimes.** Images build from `node:20-bookworm-slim`
  ([`docker/web.Dockerfile`](docker/web.Dockerfile),
  [`docker/worker.Dockerfile`](docker/worker.Dockerfile)); the web image runs as a
  non-root `nextjs` user.

## 10. Reporting a vulnerability

Please report suspected vulnerabilities privately to **security@autovisual.ai**
(do not open a public issue). Include reproduction steps and impact. We aim to
acknowledge within 2 business days.
