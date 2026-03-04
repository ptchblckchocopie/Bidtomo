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
docker compose -f docker-compose.prod.yml up -d    # Production: Caddy + all services (internal ports only)
./start.sh.local     # Full local dev: starts Docker + all 4 services with health checks & colored logs
./start-docker.sh    # Full stack: all containers (Docker only)
./stop-docker.sh     # Stop all
pm2 start ecosystem.config.js  # Alternative: PM2 process manager for all 4 services
```

**Docker Compose files:**
- `docker-compose.local.yml` — Local dev (Postgres :5433, Redis :6380, no app containers)
- `docker-compose.prod.yml` — Production (Caddy reverse proxy + all 4 app services + Postgres + Redis, internal ports only)
- `docker-compose.yml` — **Stale/legacy**, do not use for production

**Ports:** Frontend 5173 | CMS 3001 | SSE 3002 | Postgres 5433 | Redis 6379/6380

## Key Architecture Patterns

### Bridge Proxy (`frontend/src/routes/api/bridge/`)

All CMS calls from the browser go through SvelteKit server routes that proxy to CMS:
```
Browser → /api/bridge/<resource> (+server.ts) → cmsRequest() → CMS :3001/api/<resource>
```
- `frontend/src/lib/server/cms.ts` contains `cmsRequest()` — **server-only**, uses `$env/dynamic/private`. Never import in client code.
- Token extraction order: `Authorization: JWT` header → `Authorization: Bearer` header → `auth_token` httpOnly cookie.
- `frontend/src/lib/api.ts` is the client-side API layer. All calls go to `/api/bridge/*` relative paths.

### Auth: Dual Token Storage

Login sets **both** an httpOnly `auth_token` cookie (for bridge routes, auto-sent by browser) **and** returns the token in JSON (stored in `localStorage` for SSE connections to port 3002, which can't use httpOnly cookies). Both must stay in sync.

### Bidding Pipeline

Bids are queued to Redis (`bids:pending`), not written directly. The bid-worker (`services/bid-worker/`) consumes the queue and **writes SQL directly to PostgreSQL** (bypasses Payload ORM for performance). Payload v2 stores relationships in `<collection>_rels` tables with `parent_id`, `path`, and `<related_collection>_id` columns — the worker must follow this schema.

**Race condition prevention:** All bid writes use `SELECT ... FOR UPDATE` row-level locks on the products table — in the bid-worker, the Redis-down fallback path, and the second-bidder acceptance endpoint. The worker retries up to 3 times with 1s delay, failing to `bids:failed` queue.

**Redis fallback:** When Redis is unavailable, CMS falls back to writing bids directly to PostgreSQL in a `BEGIN/COMMIT/ROLLBACK` transaction with `FOR UPDATE` locking. This bypasses the queue entirely.

### SSE Real-Time Updates

Three SSE endpoints on port 3002: `/events/products/:id` (public), `/events/users/:id` (auth via `?token=` query param), `/events/global` (public). Redis pub/sub channels: `sse:product:<id>`, `sse:user:<id>`, `sse:global`. Product events are also forwarded to `sse:global` for the browse page grid. Per-IP connection limit: 20 max.

### JWT Secret Sharing Across Services

Payload v2 hashes `PAYLOAD_SECRET` with SHA-256 before signing JWTs. The SSE service and bid-worker must replicate this: `crypto.createHash('sha256').update(secret).digest('hex').slice(0, 32)`. If you change `PAYLOAD_SECRET`, all services need the same value.

### CMS Global Function Injection

Collection hooks use globals because importing `ioredis` directly would crash the Payload Webpack admin bundle. Functions assigned in `cms/src/server.ts` at startup:
- `(global as any).publishProductUpdate` — SSE product channel
- `(global as any).publishMessageNotification` — SSE user channel
- `(global as any).publishGlobalEvent` — SSE global channel
- `(global as any).indexProduct` / `updateProductIndex` — Elasticsearch sync

### Custom CMS Endpoints (in `cms/src/server.ts`)

Express routes registered **before** `payload.init()` to avoid Payload's route interception. Most use `overrideAccess: true` to bypass collection access control — but this does NOT skip field validation, so all `required` fields must still be provided.
- `/api/bid/queue`, `/api/bid/accept` — Redis bid queue
- `/api/users/limits`, `/api/users/profile-picture` — user-specific
- `/api/search/products` — Elasticsearch with Payload fallback
- `/api/void-request/*` — 4-step void flow (create → respond → seller-choice → second-bidder-response) using `overrideAccess: true`
- `/api/health` — Health check
- `/api/typing`, `/api/typing/:productId` — Typing indicators (POST to set, GET to poll)
- `/api/create-conversations` — Auto-create conversation threads
- `/api/elasticsearch/sync` — Manual Elasticsearch bulk sync
- `/api/sync-bids` — Internal bid data sync
- `/api/backup/trigger` — Manual database backup (`cms/src/services/backupService.ts`)

### Redis Channels

- **`bids:pending`** — Bid queue (produced by CMS, consumed by bid-worker)
- **`sse:product:<id>`**, **`sse:user:<id>`**, **`sse:global`** — SSE pub/sub
- **`bids:processing`** — Bid currently being processed by worker
- **`email:queue`** — Email job queue (consumed by `cms/src/services/emailService.ts`)

### CMS Collections

All defined inline in `cms/src/payload.config.ts` except EmailTemplates (`cms/src/collections/EmailTemplates.ts`):
- **users** — Auth, roles (admin/seller/buyer), profile, PII stripping in afterRead hooks
- **products** — Auction listings, media relationships, `status` + `active` fields, multi-select `categories` field
- **bids** — Bid history, bidder/product relationships
- **messages** — User-to-user messaging with conversation threads
- **transactions** — Purchase/sale records, links to void-requests
- **void-requests** — 4-step dispute/refund workflow
- **media** — S3-backed file uploads (Supabase Storage)
- **ratings** — User ratings and reviews
- **EmailTemplates** — Transactional email templates

### CMS Redis Module (`cms/src/redis.ts`)

Standalone module managing the CMS Redis connection. Exports: `isRedisConnected()`, `queueBid()`, `queueAcceptBid()`, `publishMessageNotification()`, `publishProductUpdate()`, `publishTypingStatus()`, `publishGlobalEvent()`, `closeRedis()`. The `queueAcceptBid()` pushes `accept_bid` type jobs to the same `bids:pending` queue. Redis retries up to 3 times before giving up.

### Email Service (`cms/src/services/emailService.ts`)

Uses **Resend** (`resend` npm package) as email provider. Handles void request notifications, auction restarts, second bidder offers. Jobs queued via Redis `email:queue` channel with HTML templates and embedded assets. Rate-limited to 2 emails/second internally. Falls back to direct send if Redis is unavailable.

### Frontend Key Files

- **`src/lib/api.ts`** — Client-side API layer; all calls go to `/api/bridge/*`
- **`src/lib/sse.ts`** (~16KB) — SSE event handler for product/user/global channels
- **`src/lib/server/cms.ts`** — Server-only `cmsRequest()` bridge; uses `$env/dynamic/private`
- **`src/lib/stores/auth.ts`** — Auth store (Svelte 4 `writable`, not yet migrated to runes)
- **`src/lib/stores/inbox.ts`** — Message inbox store
- **`src/lib/stores/theme.ts`** — Theme store (`light | dark | system`, persisted to `localStorage`)
- **`src/lib/stores/watchlist.ts`** — Watchlist store with `Map<productId, watchlistItemId>` for O(1) lookup
- **`src/lib/data/categories.ts`** — 19 product categories, exports `CategoryValue` type and `getCategoryLabel()`

## Important Conventions

- **SSR disabled** — Client-side SPA (`export const ssr = false` in `+layout.ts`). `+page.ts` load functions run in the browser — `fetch` goes to `/api/bridge/*`, not directly to CMS.
- **Svelte 5 runes** — Use `$state`, `$derived`, `$props` (not Svelte 4 store syntax). Note: `stores/auth.ts` still uses Svelte 4 `writable`.
- **Bauhaus design system** — Sharp corners, bold borders, Outfit font. See `/project:frontend-guide` for theme details
- **No linting/formatting** — TypeScript strict mode is the primary quality tool. Run `svelte-check` (frontend) and `tsc --noEmit` (CMS) before deploying — these are the CI gates.
- **CMS hooks auto-set fields** — Don't set manually: `seller` on Products, `bidder`/`bidTime` on Bids, `rater` on Ratings. Role is forced to `buyer` on registration.
- **Type generation** — Run `npm run generate:types` in `cms/` after changing collections
- **Media storage** — S3-compatible via Supabase Storage (`cms/src/s3Adapter.ts`)
- **Products `status` vs `active`** — Separate fields. `active` = visible on browse. `status` = sale lifecycle (`available/sold/ended`). A product can be `active: false, status: available` (hidden but not sold).
- **Relationship depth** — All product list queries use `depth=1` to populate one level of relationships (e.g., media, seller) without infinite recursion. Missing `depth=1` is a common cause of broken images/data on the browse page.
- **Elasticsearch is optional** — When unavailable, search falls back to Payload's native query. All ES operations are gated by `isElasticAvailable()`.
- **Migrations** — Production runs `payload migrate` via GitHub Actions post-deploy. The `cms/scripts/run-migrations.js` script clears `DB_PUSH` sentinel rows then runs `payload migrate` non-interactively. Staging uses `DB_PUSH=true` for dev convenience.
- **Legacy docs at root** — `README.md`, `QUICKSTART.md`, `SETUP.md`, `AUTHENTICATION.md`, `DOCKER.md`, `PLANNING.md`, `progress.md` are outdated (refer to old 3-service setup, Node 18, Railway, all-localStorage auth). **Do not trust these** — use this CLAUDE.md and the slash commands instead.

## Deployment & CI

### Current Setup (March 2026)

**Railway expired** — all Railway deployments removed, database lost. Backend migrated to **DigitalOcean**.

- **Frontend** → Vercel (auto-deploy, unchanged)
- **Backend (CMS, SSE, bid-worker, Postgres, Redis)** → DigitalOcean droplet with `docker-compose.prod.yml` (Caddy reverse proxy for automatic HTTPS)
- **App directory on droplet:** `/opt/bidtomo`
- **Database starts fresh** — no data from Railway was recovered

### Production Infrastructure

- **`docker-compose.prod.yml`** — Caddy + all 4 app services + Postgres + Redis. Caddy routes: `/sse/*` → SSE service (strips prefix), `/api/*` + `/admin/*` + `/media/*` → CMS, default → CMS.
- **`Caddyfile`** — Uses `{$DOMAIN:localhost}` env var for the domain.
- **`scripts/setup-droplet.sh`** — Initial droplet setup: installs Docker, fail2ban, UFW (allow SSH/HTTP/HTTPS only).
- **`.env.production.example`** — Root-level production env template for `docker-compose.prod.yml`.
- **`deploy.sh`** — Blue/green deployment with atomic symlink swaps (`build_blue`/`build_green`), runs SQL migrations via `psql`, reloads via `pm2`.

### CI/CD

- **CI gate:** `tsc --noEmit` (CMS) + `npm run check` (frontend). No unit tests — only k6 stress tests in `tests/stress/`.
- **GitHub Actions workflows** — `deploy-staging.yml` (non-main pushes) and `deploy-production.yml` (main pushes). Both deploy via SSH (`appleboy/ssh-action@v1`) to the droplet. Production runs `npm run migrate` after deploy; staging does not (uses `DB_PUSH=true`).
- **GitHub Secrets required:** `DROPLET_IP`, `SSH_USER`, `SSH_PRIVATE_KEY`.
- **Sentry** — All services: Frontend (`frontend/src/hooks.client.ts`, `hooks.server.ts`, source maps via `sentrySvelteKit()` vite plugin), CMS (`@sentry/node` in `server.ts`), bid-worker, and SSE service.
- **DigitalOcean MCP** is configured in `.claude.json` for this project. Use `/mcp` to connect.

## User Analytics Tracking

**Status:** Implemented. Full spec in [`docs/analytics-spec.md`](docs/analytics-spec.md).

**Summary:** `user-events` Payload collection (admin-only, "Analytics" group) tracking frontend events (page views, searches, logins) and CMS-side events (bids, messages, transactions) via batched bridge route + `afterChange` hooks. Uses the global function injection pattern (`(global as any).trackEvent`) and fire-and-forget `setImmediate` writes.

**Key files:**
- `frontend/src/lib/analytics.ts` — Client-side batching (3s flush, sendBeacon on unload)
- `frontend/src/routes/api/bridge/analytics/track/+server.ts` — Bridge route (anonymous OK)
- `cms/src/server.ts` — `POST /api/analytics/track` endpoint (120/min rate limit) + `(global as any).trackEvent`
- `cms/src/middleware/validate.ts` — `analyticsTrackSchema`
- `cms/src/payload.config.ts` — `user-events` collection + `afterChange` hooks on products, bids, messages, transactions, ratings

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
