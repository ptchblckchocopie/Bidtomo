# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidmo.to is a full-stack auction marketplace with real-time bidding. Independent services (not a monorepo):

- **`frontend/`** — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel
- **`cms/`** — Payload CMS 2 on Express, PostgreSQL, Webpack bundler, Elasticsearch
- **`services/sse-service/`** — Standalone SSE server for real-time product updates
- **`services/bid-worker/`** — Background Redis queue consumer for bid processing

## Initial Setup

**Node.js 20+** required (CMS `engines` field enforces this; nixpacks deploys with `nodejs_20`).

Each service has its own `package.json` — run `npm install` in each directory independently. Copy `.env.example` files before starting:

```bash
cp cms/.env.example cms/.env
cp frontend/.env.example frontend/.env
```

## Development Commands

### Frontend (`frontend/`) — port 5173

```bash
npm run dev          # Vite dev server on :5173
npm run build        # Production build
npm run check        # svelte-kit sync + svelte-check (type checking)
```

### CMS Backend (`cms/`) — port 3001

```bash
npm run dev          # nodemon with PAYLOAD_CONFIG_PATH=src/payload.config.ts on :3001
npm run build        # tsc + payload build
npm run serve        # Production server from dist/
npm run migrate      # Run Payload database migrations
npm run generate:types  # Regenerate payload-types.ts from collections
```

### Services (`services/`)

Each service: `npm run build` to build, `npm start` to run.

### Infrastructure (from repo root)

```bash
docker compose -f docker-compose.local.yml up -d  # Local dev: Postgres :5433, Redis :6380
./start.sh.local     # Full local dev: starts Docker + all 4 services with health checks & colored logs
./start-docker.sh    # Full stack: all containers (Docker only)
./stop-docker.sh     # Stop all
pm2 start ecosystem.config.js  # Alternative: PM2 process manager for all 4 services
```

**Ports:** Frontend 5173 | CMS 3001 | SSE 3002 | Postgres 5433 | Redis 6379/6380

## Key Architecture Patterns

### Bridge Proxy (`frontend/src/routes/api/bridge/`)

All CMS calls from the browser go through SvelteKit server routes that proxy to CMS:
```
Browser → /api/bridge/<resource> (+server.ts) → cmsRequest() → CMS :3001/api/<resource>
```
- `frontend/src/lib/server/cms.ts` contains `cmsRequest()` — **server-only**, uses `$env/dynamic/private`. Never import in client code.
- Token extraction order: `Authorization: JWT` header → `Authorization: Bearer` header → `auth_token` httpOnly cookie.
- `frontend/src/lib/api.ts` is the client-side API layer (~55KB). All calls go to `/api/bridge/*` relative paths.

### Auth: Dual Token Storage

Login sets **both** an httpOnly `auth_token` cookie (for bridge routes, auto-sent by browser) **and** returns the token in JSON (stored in `localStorage` for SSE connections to port 3002, which can't use httpOnly cookies). Both must stay in sync.

### Bidding Pipeline

Bids are queued to Redis (`bids:pending`), not written directly. The bid-worker (`services/bid-worker/`) consumes the queue and **writes SQL directly to PostgreSQL** (bypasses Payload ORM for performance). Payload v2 stores relationships in `<collection>_rels` tables with `parent_id`, `path`, and `<related_collection>_id` columns — the worker must follow this schema.

### SSE Real-Time Updates

Three SSE endpoints on port 3002: `/events/products/:id` (public), `/events/users/:id` (auth via `?token=` query param), `/events/global` (public). Redis pub/sub channels: `sse:product:<id>`, `sse:user:<id>`, `sse:global`. Product events are also forwarded to `sse:global` for the browse page grid.

### CMS Global Function Injection

Collection hooks use `(global as any).broadcastProductUpdate` etc. because importing `ioredis` directly would crash the Payload Webpack admin bundle. Functions are assigned to `global` in `cms/src/server.ts` at startup.

### Custom CMS Endpoints (in `cms/src/server.ts`)

Express routes registered **before** `payload.init()` to avoid Payload's route interception:
- `/api/bid/queue`, `/api/bid/accept` — Redis bid queue
- `/api/users/limits`, `/api/users/profile-picture` — user-specific
- `/api/search/products` — Elasticsearch with Payload fallback
- `/api/void-request/*` — 4-step void flow (create → respond → seller-choice → second-bidder-response) using `overrideAccess: true`

## Important Conventions

- **SSR disabled** — Client-side SPA (`export const ssr = false` in `+layout.ts`). `+page.ts` load functions run in the browser — `fetch` goes to `/api/bridge/*`, not directly to CMS.
- **Svelte 5 runes** — Use `$state`, `$derived`, `$props` (not Svelte 4 store syntax). Note: `stores/auth.ts` still uses Svelte 4 `writable`.
- **Bauhaus design system** — Sharp corners, bold borders, Outfit font. See `/project:frontend-guide` for theme details
- **No linting/formatting** — TypeScript strict mode is the primary quality tool. Run `svelte-check` (frontend) and `tsc --noEmit` (CMS) before deploying — these are the CI gates.
- **CMS hooks auto-set fields** — Don't set manually: `seller` on Products, `bidder`/`bidTime` on Bids, `rater` on Ratings. Role is forced to `buyer` on registration.
- **Type generation** — Run `npm run generate:types` in `cms/` after changing collections
- **Collections are mostly inline** in `cms/src/payload.config.ts` (except `EmailTemplates`)
- **Media storage** — S3-compatible via Supabase Storage (`cms/src/s3Adapter.ts`)
- **Products `status` vs `active`** — Separate fields. `active` = visible on browse. `status` = sale lifecycle (`available/sold/ended`). A product can be `active: false, status: available` (hidden but not sold).
- **Elasticsearch is optional** — When unavailable, search falls back to Payload's native query. All ES operations are gated by `isElasticAvailable()`.
- **Migrations** — Production uses Payload migrations (`npm run migrate`). Staging uses `DB_PUSH=true` for quick schema sync.

## Deployment & CI

- **`main`** → production (Railway + Vercel auto-deploy frontend)
- **`staging`** / any non-main branch → Railway `staging-v2` environment
- **Frontend deploys via Vercel** (not GitHub Actions). Backend services deploy via GitHub Actions to Railway.
- **CI gate:** `tsc --noEmit` (CMS) + `npm run check` (frontend). No unit tests — only k6 stress tests in `tests/stress/`.
- **Sentry** — Frontend only (`frontend/src/hooks.client.ts` and `hooks.server.ts`). Source maps uploaded via `sentrySvelteKit()` vite plugin.

## Slash Commands for Detailed Guides

Use these project commands to load detailed context on-demand:

- `/project:architecture` — Request flow, bridge routes, bidding pipeline, key files, Redis channels, auth
- `/project:frontend-guide` — Frontend architecture, API bridge, auth, stores, SSE, design system
- `/project:cms-guide` — Payload CMS structure, collections, column naming, storage, migrations
- `/project:security` — Access control, rate limiting, CSRF, SSE auth, PII, protected routes
- `/project:deploy` — Deployment guide, Railway/Vercel IDs, CMS deploy commands
- `/project:staging` — Staging environment setup, URLs, deploy commands
- `/project:push-staging` — Pre-push review and deploy to staging
- `/project:stagingtomain` — Staging to main merge and production deploy
- `/project:pitfalls` — Known bugs, gotchas, and recurring issues
- `/project:env-vars` — All environment variables, CORS config, .env rules
- `/project:tech-debt` — Known technical debt items
- `/project:stress-test` — k6 stress testing guide, scenarios, report interpretation
- `/project:evaluate-repository` — Full repository evaluation (supports scoped mode: `security`, `code-quality`, `docs`, `functionality`, `testing`, `devops`, `hygiene`, `claude-code`, `financial`, `realtime`)
