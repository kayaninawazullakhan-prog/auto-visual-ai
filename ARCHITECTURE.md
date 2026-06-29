# AUTO VISUAL AI — System Architecture

> Automatically transforms a talking-head video into a professionally edited,
> cinema-quality vertical (9:16) short-form video: analyze speech → understand
> context → generate visuals → synchronize to spoken words → approve → render → export.

---

## 1. High-Level Overview

```
                         ┌────────────────────────────────────────────┐
                         │                  apps/web                   │
                         │   Next.js 15 (App Router) · React · TS      │
                         │   Tailwind · shadcn/ui · Clerk · Stripe     │
                         │                                              │
                         │   • Dashboard / Project pages               │
                         │   • Editor (preview/timeline/approval)      │
                         │   • REST API routes (/api/*)                │
                         │   • Webhooks (Clerk, Stripe, providers)     │
                         └───────────────┬──────────────┬─────────────┘
                                         │              │
                          enqueue jobs   │              │  read/write
                                         ▼              ▼
                    ┌──────────────────────┐   ┌─────────────────────┐
                    │   Redis + BullMQ     │   │   PostgreSQL         │
                    │   (job queues)       │   │   (Prisma ORM)       │
                    └──────────┬───────────┘   └─────────────────────┘
                               │ consume
                               ▼
              ┌────────────────────────────────────────────┐
              │                apps/worker                  │
              │   Node.js · BullMQ workers · FFmpeg         │
              │                                             │
              │   Pipeline stages (each a queue):           │
              │   extract-audio → transcribe → analyze →    │
              │   generate-assets → build-timeline →        │
              │   subtitles → render → quality → export     │
              └───────┬───────────────┬──────────────┬──────┘
                      │               │              │
                      ▼               ▼              ▼
          ┌────────────────┐ ┌───────────────┐ ┌──────────────┐
          │  packages/ai   │ │ packages/render│ │   AWS S3     │
          │  providers:    │ │  Remotion +    │ │  originals,  │
          │  Whisper, LLM, │ │  FFmpeg comp.  │ │  assets,     │
          │  Flux/SDXL,    │ │                │ │  renders,    │
          │  Runway/Kling/ │ │                │ │  exports     │
          │  Pika          │ │                │ │              │
          └────────────────┘ └───────────────┘ └──────────────┘
```

- **`apps/web`** owns all user interaction, auth, billing, the editor UI, and the
  HTTP API. It never does heavy compute inline — it validates, persists, and
  enqueues.
- **`apps/worker`** owns the long-running pipeline. Each stage is an idempotent
  BullMQ job that reads state from Postgres, calls a provider through
  `packages/ai` or renders through `packages/render`, writes results to S3, and
  updates the DB + emits progress.
- **Shared packages** (`db`, `types`, `config`, `ai`, `render`) are the contract
  between web and worker so both sides stay type-safe and provider-agnostic.

---

## 2. Monorepo Layout

```
auto-visual-ai/
├── apps/
│   ├── web/                 # Next.js 15 — UI + API routes + webhooks   (Phases 1, 8)
│   └── worker/              # BullMQ pipeline workers                    (Phases 1–7)
├── packages/
│   ├── db/                  # Prisma schema + client singleton          (Phase 0)
│   ├── types/               # Shared domain types & DTOs                 (Phase 0)
│   ├── config/              # Zod-validated env + feature flags          (Phase 0)
│   ├── ai/                  # Provider adapters (transcribe/LLM/img/vid) (Phases 2–4)
│   └── render/              # Remotion compositions + FFmpeg utils       (Phases 6–7)
├── docker/                  # Dockerfiles for web + worker
├── docker-compose.yml       # Local Postgres + Redis (+ MinIO optional)
├── turbo.json               # Turborepo task graph
└── pnpm-workspace.yaml
```

**Package scope:** `@ava/*` (Auto Visual AI). E.g. `@ava/db`, `@ava/ai`.

---

## 3. The 16-Step Pipeline → Engines → Queues

Each numbered step in the product spec maps to a worker queue. Stages are chained:
finishing one enqueues the next, and `Project.stage` + the `Job` table track
progress for the UI.

| #  | Step                       | Queue / Engine            | Provider / Tool                  |
|----|----------------------------|---------------------------|----------------------------------|
| 1  | Upload source video        | `upload` (web, presigned) | S3 multipart                     |
| 2  | Extract audio              | `extract-audio`           | FFmpeg                           |
| 3  | Transcript                 | `transcribe`              | Whisper                          |
| 4  | Word-level timestamps      | `transcribe`              | Whisper / WhisperX               |
| 5  | Detect topics              | `analyze`                 | Claude / OpenAI                  |
| 6  | Detect keywords            | `analyze`                 | Claude / OpenAI                  |
| 7  | Detect entities            | `analyze`                 | Claude / OpenAI                  |
| 8  | Visual opportunities       | `analyze`                 | Claude / OpenAI + Prompt Engine  |
| 9  | Generate images            | `generate-assets`         | Flux / SDXL / OpenAI Images      |
| 10 | Generate videos            | `generate-assets`         | Runway / Kling / Pika            |
| 11 | Generate animations        | `generate-assets`         | Remotion / motion templates      |
| 12 | Generate subtitles         | `subtitles`               | Word timings → caption styler    |
| 13 | Build timeline             | `build-timeline`          | Timeline + Word-Sync engine      |
| 14 | Request approval           | (web)                     | Approval state machine           |
| 15 | Render final video         | `render`                  | Remotion + FFmpeg                |
| 16 | Export high-quality video  | `export`                  | FFmpeg (codecs/presets) + QC     |

**Approval gate (step 14):** the pipeline pauses after `generate-assets`. The
project enters `AWAITING_APPROVAL`; rendering only enqueues once approvals
resolve. (User-level approval of *generated assets* — distinct from the
phase-by-phase build approvals in this engagement.)

---

## 4. Final Video Layout (9:16)

```
┌───────────────────────────────┐  ← 1080×1920 (HD) or 2160×3840 (4K)
│                               │
│   AI VISUALS  (top ~55%)      │  images / videos / motion graphics /
│   word-synced to transcript   │  AI animations, swapped per timeline item
│                               │
├───────────────────────────────┤
│                               │
│   CREATOR FACECAM (bottom)    │  cropped/zoomed source video
│                               │
├───────────────────────────────┤
│  ANIMATED CAPTIONS (overlay)  │  karaoke / Hormozi style, active-word
└───────────────────────────────┘  highlight, emoji, animations
```

Composed in **Remotion** as a single composition driven by the timeline JSON;
audio is the original extracted track. FFmpeg handles final transcode, codec
selection, and quality validation.

---

## 5. Data Flow (one project, happy path)

1. **Web**: user creates `Project`, requests a presigned S3 URL, uploads the
   original video directly to S3, then `POST /api/upload/complete` records the
   `Video` row and enqueues `extract-audio`.
2. **Worker `extract-audio`**: FFmpeg pulls audio → S3, writes probe metadata
   (duration/fps/codec) → enqueues `transcribe`.
3. **Worker `transcribe`**: Whisper → `Transcript` + `TranscriptSegment[]` with
   `words` JSON (word-level timing) → enqueues `analyze`.
4. **Worker `analyze`**: LLM per segment → `Topic[]`, `Keyword[]`, segment
   `visualIdeas`; Prompt Engine expands ideas into provider prompts → enqueues
   `generate-assets`.
5. **Worker `generate-assets`**: per segment, 5 image options + 3 video options
   via adapters → `GeneratedAsset[]` (status `READY`) in S3 → sets project
   `AWAITING_APPROVAL`, creates pending `Approval` rows.
6. **Web**: user approves/rejects/regenerates/edits in the Editor. On
   "Render", web builds/refreshes the timeline (`build-timeline`,
   `subtitles`) and enqueues `render`.
7. **Worker `render` → `quality` → `export`**: Remotion renders the composition,
   FFmpeg transcodes per chosen preset, QC scores the output (≥95 or
   regenerate/upscale/rerender), `Export` rows expose signed download URLs.

Every stage is **idempotent** and **resumable**: it keys off DB state, so a
retried job re-derives rather than duplicates.

---

## 6. Provider Abstraction (`packages/ai`)

All external AI is hidden behind narrow interfaces so providers are swappable and
"just add an API key" works:

```ts
interface TranscriptionProvider { transcribe(input): Promise<TranscriptResult> }
interface UnderstandingProvider  { analyze(segment): Promise<SegmentAnalysis> }
interface ImageProvider          { generate(prompt, opts): Promise<GeneratedImage> }
interface VideoProvider          { generate(prompt, opts): Promise<GeneratedVideo> }
```

A registry resolves the active provider from env (`IMAGE_PROVIDER`,
`VIDEO_PROVIDER`, `WHISPER_PROVIDER`, `UNDERSTANDING_PROVIDER`) and throws a
typed `MissingProviderKeyError` if the selected provider's key is absent.

---

## 7. Tech Stack

| Layer        | Choice                                                        |
|--------------|--------------------------------------------------------------|
| Frontend     | Next.js 15 (App Router), React 18, TypeScript, Tailwind, shadcn/ui |
| Backend      | Next.js API routes + Node.js worker, Prisma                  |
| Database     | PostgreSQL                                                   |
| Queue        | Redis + BullMQ                                               |
| Storage      | AWS S3 (CloudFront for delivery)                             |
| Video        | FFmpeg, Remotion                                             |
| Auth         | Clerk                                                        |
| Payments     | Stripe                                                       |
| LLM          | Claude (Anthropic) / OpenAI                                  |
| Transcription| Whisper (OpenAI / Replicate / local)                        |
| Images       | Flux, SDXL, OpenAI Images (via fal.ai / Replicate)          |
| Video gen    | Runway, Kling, Pika                                          |

---

## 8. Security & Scalability (detailed in Phase 9)

- **Security:** Clerk-issued sessions; server-side authorization on every route
  scoped by `userId`; presigned, short-TTL S3 URLs; webhook signature
  verification (Clerk/Stripe/providers); secrets only in env / secrets manager;
  per-user rate limits and credit checks before enqueueing paid work.
- **Scalability:** stateless web (horizontal scale behind a load balancer);
  worker pool scales independently per queue; heavy GPU/3rd-party work is
  offloaded to providers; S3 + CloudFront for media; Postgres read replicas and
  connection pooling (PgBouncer); BullMQ rate limiting + per-provider concurrency
  caps to respect upstream limits.

---

## 9. Build Phases (this engagement)

| Phase | Scope |
|-------|-------|
| **0** | Foundation: architecture, structure, Prisma schema, Docker, env, shared types ← *you are here* |
| 1 | Core backend: API scaffold, S3, Clerk, Redis/BullMQ |
| 2 | Upload + transcription (FFmpeg, Whisper) |
| 3 | AI understanding + visual-opportunity + prompt engine |
| 4 | Asset generation (image + video adapters) |
| 5 | Approval + timeline + word-sync |
| 6 | Subtitles + Remotion 9:16 composition + branding |
| 7 | Render + export + quality validation |
| 8 | Editor frontend |
| 9 | Billing + security + scalability + AWS deploy + CI/CD + roadmap |
