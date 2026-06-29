# Production Roadmap

Where AUTO VISUAL AI is, and where it's going. The product is built in phases
(see [ARCHITECTURE.md](ARCHITECTURE.md) §9); this roadmap records what has shipped,
then the **hardening**, **scale**, and **feature** work that takes it from
feature-complete to battle-tested at scale.

Legend: ✅ shipped · 🔜 next · 🧭 planned

---

## Shipped — Foundation → Render (Phases 0–9)

The end-to-end product spec maps to a 16-step pipeline, each step an engine /
BullMQ queue ([ARCHITECTURE.md](ARCHITECTURE.md) §3). All core phases are in place:

| Phase | Scope | Status |
|------:|-------|:------:|
| 0 | Foundation: architecture, monorepo, Prisma schema, Docker, env/config, shared types | ✅ |
| 1 | Core backend: API scaffold, S3 (`@ava/storage`), Clerk auth, Redis/BullMQ | ✅ |
| 2 | Upload + transcription: FFmpeg audio extract, Whisper, word-level timestamps | ✅ |
| 3 | AI understanding: topics, keywords, entities, visual opportunities + prompt engine | ✅ |
| 4 | Asset generation: image (Flux/SDXL/OpenAI) + video (Runway/Kling/Pika) adapters | ✅ |
| 5 | Approval workflow + timeline + word-sync engine | ✅ |
| 6 | Subtitles + Remotion 9:16 composition + branding | ✅ |
| 7 | Render + export + quality validation (≥`QUALITY_MIN_SCORE`) | ✅ |
| 8 | Editor frontend (preview / timeline / approval / captions / branding / render) | ✅ |
| 9 | Billing + security/scalability docs + AWS deploy + CI/CD (this phase) | ✅ |

### The 20 required outputs (original spec) — status

The spec defines 20 deliverables: the 16 pipeline engines plus four production
concerns. All are accounted for; the four cross-cutting items are where ongoing
hardening lives.

| # | Output | Where | Status |
|--:|--------|-------|:------:|
| 1 | Upload source video | `/api/upload` + presigned S3 | ✅ |
| 2 | Extract audio | `extract-audio` (FFmpeg, `@ava/media`) | ✅ |
| 3 | Transcript | `transcribe` (Whisper) | ✅ |
| 4 | Word-level timestamps | `transcribe` (WhisperX) → `TranscriptSegment.words` | ✅ |
| 5 | Detect topics | `analyze` → `Topic[]` | ✅ |
| 6 | Detect keywords | `analyze` → `Keyword[]` | ✅ |
| 7 | Detect entities | `analyze` → `Keyword(kind=ENTITY)` | ✅ |
| 8 | Visual opportunities | `analyze` + prompt engine → `visualIdeas` | ✅ |
| 9 | Generate images | `generate-assets` (Flux/SDXL/OpenAI) | ✅ |
| 10 | Generate videos | `generate-assets` (Runway/Kling/Pika) | ✅ |
| 11 | Generate animations | `generate-assets` (Remotion / motion templates) | ✅ |
| 12 | Generate subtitles | `subtitles` (caption styler) | ✅ |
| 13 | Build timeline | `build-timeline` (word-sync) | ✅ |
| 14 | Approval step | `/api/approve` + `Approval` state machine | ✅ |
| 15 | Render final video | `render` (Remotion + FFmpeg) | ✅ |
| 16 | Export high-quality video | `export` + QC + presigned download | ✅ |
| 17 | **Authentication & billing** | Clerk + Stripe (`/api/billing/*`, webhook) | ✅ → 🔜 hardening |
| 18 | **Security** | [SECURITY.md](SECURITY.md) | ✅ → 🔜 hardening |
| 19 | **Scalability / deploy** | [SCALABILITY.md](SCALABILITY.md), [DEPLOYMENT.md](DEPLOYMENT.md) | ✅ |
| 20 | **CI/CD** | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | ✅ |

---

## 🔜 Hardening (production-readiness)

Make the running system safe, observable, and trustworthy. These are the highest
priority before a public launch.

- **Encryption at rest for UI-stored keys.** Settings-page provider keys are
  currently plaintext in the `Setting` table
  ([`packages/db/src/settings.ts`](packages/db/src/settings.ts), overlaid via
  `applyOverrides` in [`packages/config/src/env.ts`](packages/config/src/env.ts)).
  Encrypt with KMS envelope encryption (or `pgcrypto`), decrypt only in-process,
  and restrict the settings UI to admins. *(See [SECURITY.md](SECURITY.md) §4.)*
- **Rate limiting.** Redis-backed per-user / per-IP limits on expensive mutating
  routes (`/api/analyze`, `/api/generate-assets`, `/api/render`,
  `/api/billing/checkout`) and webhook endpoints; complement with ALB/WAF rules.
  *(See [SECURITY.md](SECURITY.md) §7.)*
- **Observability — Sentry + metrics.** Wire Sentry into `apps/web` and
  `apps/worker` for error tracking and traces; publish BullMQ queue depth, job
  durations, and provider latency/cost to CloudWatch; dashboards + alarms
  (5xx rate, ALB latency, RDS connections, Redis memory, DLQ size).
- **Automated tests.** Turbo already wires a `test` task. Add: unit tests for
  billing mapping (`apps/web/lib/billing.ts` price↔plan, status mapping) and
  config/feature detection; integration tests for the webhook reconciliation and
  auth/authorization guards; a smoke test of the pipeline against mock providers.
  Gate CI on them.
- **Structured logging & audit trail.** Replace ad-hoc `console.*` with a
  structured logger (request id, user id, job id); add an audit log for billing
  and approval state transitions.
- **Backups & DR.** RDS automated backups + PITR, tested restores; S3 versioning
  + cross-region replication for irreplaceable originals/exports; a documented
  runbook and RPO/RTO targets.
- **Dependency hygiene.** Dependabot/Renovate, `pnpm audit` gate in CI, GitHub
  Actions pinned to SHAs, SBOM on release. *(See [SECURITY.md](SECURITY.md) §9.)*

## 🧭 Scale

Throughput and cost once traffic grows (mechanics in [SCALABILITY.md](SCALABILITY.md)).

- **Connection pooling** in front of RDS (PgBouncer / RDS Proxy) before scaling
  web/worker replicas wide.
- **Per-queue worker auto-scaling** on BullMQ depth; split render onto
  GPU/spot instances; evaluate **Remotion Lambda** for bursty render fan-out.
- **Read replicas** for dashboards/listings; route heavy reads off the primary.
- **CloudFront** in front of all media with lifecycle policies on intermediate S3
  artifacts to control storage/egress cost.
- **Per-provider rate limits + concurrency caps** tuned to each vendor's quota;
  multi-provider load balancing to ride out quota limits.
- **Per-tenant cost metering** (asset `meta` already records provider cost/req-id)
  feeding budget alerts and plan pricing.

## 🧭 Feature roadmap

Product growth, building on the existing engines.

- **Multi-visual-per-segment word sync.** Today a segment maps to a chosen visual;
  extend the word-sync engine + timeline so a single segment can swap *multiple*
  visuals on individual keyword timings (`Keyword.startSec/endSec` already exist),
  for denser, more dynamic edits.
- **More providers.** Additional image/video/transcription backends behind the
  existing `@ava/ai` adapter interfaces (new `*_PROVIDER` enum values) — e.g. more
  video-gen vendors, on-device/self-hosted models — with zero changes to the
  pipeline.
- **Team workspaces.** Multi-user organizations with shared projects, roles, and
  seat-based billing (extends `User`/`Billing`; Clerk Organizations). Move
  authorization from per-user to per-workspace membership.
- **A/B caption styles.** Generate multiple caption treatments per render (the
  `CaptionStyle` / `CaptionAnimation` enums already model the variants) so creators
  can preview/compare Hormozi vs. karaoke vs. TikTok styles and pick the winner.
- **Templates & brand presets.** Reusable project templates and saved branding
  profiles (logo/watermark/colors/fonts) applied at creation time.
- **More export targets & languages.** Additional presets/codecs
  (`ExportPreset`/`ExportCodec`) and broader multi-language caption translation
  (`Language` enum) including auto-dubbing.
- **Public API & webhooks-out.** Authenticated REST/SDK access and outbound
  webhooks (e.g. "render complete") for programmatic and partner integrations.
- **Analytics dashboard.** Per-project/account usage, render success rate, quality
  scores, and provider spend.
```
