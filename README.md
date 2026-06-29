# AUTO VISUAL AI

Production-ready AI SaaS that automatically turns a **talking-head video** into a
**professionally edited 9:16 short-form video** — analyzing speech, understanding
context, generating word-synced visuals (images / videos / animations),
animated captions, an approval step, and cinema-quality export.

> **Status:** built in phases. Phase 0 (Foundation) is in place. See
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full system design and the phase plan.

---

## Monorepo

```
apps/web        Next.js 15 — UI, API routes, webhooks
apps/worker     BullMQ pipeline workers (FFmpeg, providers, Remotion)
packages/db     Prisma schema + client
packages/types  Shared domain types & DTOs
packages/config Zod-validated env + feature detection
packages/ai     Provider adapters (Whisper / LLM / image / video)
packages/render Remotion compositions + FFmpeg utilities
```

## Prerequisites

- **Node.js** ≥ 20 and **pnpm** ≥ 9 (`npm i -g pnpm`)
- **Docker** (for Postgres + Redis)
- **FFmpeg** (`brew install ffmpeg` on macOS) — needed by the worker in later phases

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment — only DATABASE_URL & REDIS_URL are required to boot.
#    Add provider API keys when you want to enable each engine.
cp .env.example .env

# 3. Start Postgres + Redis
pnpm docker:up

# 4. Create the database schema
pnpm db:generate
pnpm db:push        # or `pnpm db:migrate` for a tracked migration

# 5. Run everything (web + worker) in dev
pnpm dev
```

Open <http://localhost:3000>.

## "Just add an API key"

Every provider is optional and resolved at runtime from `.env`. The app boots
with none configured; each engine throws a clear `MissingProviderKeyError` only
when you actually invoke it without its key. Swap providers by changing one env
var (e.g. `IMAGE_PROVIDER=flux|sdxl|openai`, `VIDEO_PROVIDER=runway|kling|pika`).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run web + worker in watch mode |
| `pnpm build` | Build all packages/apps |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:migrate` | Create/apply a dev migration |
| `pnpm docker:up` / `docker:down` | Start/stop Postgres + Redis |
| `pnpm lint` / `typecheck` / `test` | Quality gates |

## License

Proprietary — © AUTO VISUAL AI.
