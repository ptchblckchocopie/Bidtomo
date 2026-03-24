# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidmo.to is a full-stack auction marketplace with real-time bidding. Independent services (not a monorepo):

- **`frontend/`** — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel
- **`cms/`** — Payload CMS 2 on Express, PostgreSQL, Webpack bundler, Elasticsearch
- **`services/sse-service/`** — Standalone SSE server for real-time product updates
- **`services/bid-worker/`** — Background Redis queue consumer for bid processing

## Development Commands

### Frontend (`frontend/`) — port 5173

```bash
npm run dev          # Vite dev server
npm run build        # Production build
npm run check        # svelte-kit sync + svelte-check (type checking)
```

### CMS (`cms/`) — port 3001

```bash
npm run dev             # nodemon dev server
npm run build           # tsc + payload build
npm run migrate         # Run database migrations
npm run generate:types  # Regenerate payload-types.ts
```

### Infrastructure (from repo root)

```bash
docker compose -f docker-compose.local.yml up -d  # Local dev: Postgres :5433, Redis :6380
./start.sh.local     # Full local dev: Docker + all 4 services
```

Services: `npm run build && npm start` in each `services/*/` directory.

**Ports:** Frontend 5173 | CMS 3001 | SSE 3002 | Postgres 5433 | Redis 6379/6380

## Core Architecture

### Bridge Proxy

All CMS calls from the browser go through SvelteKit server routes that proxy to CMS:
```
Browser → /api/bridge/<resource> (+server.ts) → cmsRequest() → CMS :3001/api/<resource>
```
- `frontend/src/lib/server/cms.ts` — **server-only** `cmsRequest()`. Never import in client code.
- `frontend/src/lib/api.ts` — Client-side API layer. All calls go to `/api/bridge/*`.

### Auth: Dual Token Storage

Login sets **both** an httpOnly `auth_token` cookie (for bridge routes) **and** returns the token in JSON (stored in `localStorage` for SSE connections). Both must stay in sync.

### Bidding Pipeline

Bids queue to Redis (`bids:pending`) → bid-worker consumes → writes SQL directly to PostgreSQL (bypasses Payload ORM). All bid writes use `SELECT ... FOR UPDATE` row-level locks. Redis-down fallback: CMS writes bids directly in a transaction. Auto-bid (proxy bidding) uses the same queue with type `auto_bid`.

### SSE Real-Time Updates

Three endpoints on port 3002: `/events/products/:id` (public), `/events/users/:id` (auth via `?token=`), `/events/global` (public). Redis pub/sub channels: `sse:product:<id>`, `sse:user:<id>`, `sse:global`.

### CMS Entry Point & Route Validation

`cms/src/server.ts` is the monolith entry point (~107KB) — all route registration, Redis setup, email queue, Elasticsearch init. Custom CMS routes use Zod validation middleware (`cms/src/middleware/validate.ts`) for all POST/PATCH bodies. Add schemas there when creating new routes.

### Email & Observability

- **Email** — Resend integration via `cms/src/services/emailService.ts`, queue-based sending.
- **Sentry** — Integrated in all four services (frontend SvelteKit plugin, CMS, SSE, bid-worker). Each has an `instrument.ts`.

### CMS Global Function Injection

Collection hooks use `(global as any).*` because importing `ioredis` directly crashes the Payload Webpack admin bundle. Functions assigned in `cms/src/server.ts`: `publishProductUpdate`, `publishMessageNotification`, `publishGlobalEvent`, `indexProduct`, `updateProductIndex`, `trackEvent`.

### JWT Secret Sharing

Payload v2 hashes `PAYLOAD_SECRET` with SHA-256 before signing JWTs. SSE service and bid-worker must replicate: `crypto.createHash('sha256').update(secret).digest('hex').slice(0, 32)`.

## Important Conventions

- **SSR disabled** — Client-side SPA (`export const ssr = false` in `+layout.ts`). `+page.ts` load functions run in the browser.
- **Svelte 5 runes** — Use `$state`, `$derived`, `$props`. Note: `stores/auth.ts` still uses Svelte 4 `writable`.
- **Dark mode** — `darkMode: 'class'` in Tailwind, `stores/theme.ts` toggles. CSS vars (`--color-bg`, `--color-fg`, `--color-border`, `--color-muted`) adapt per theme.
- **Bauhaus design system** — Sharp corners, bold borders, Plus Jakarta Sans font, emerald accent (#10B981). See `/project:frontend-guide`.
- **CI gates** — `npm run check` (frontend) + `tsc --noEmit` (CMS). No linter. No unit tests.
- **CMS hooks auto-set fields** — Don't set manually: `seller` on Products, `bidder`/`bidTime` on Bids, `rater` on Ratings.
- **Type generation** — Run `npm run generate:types` in `cms/` after changing collections.
- **Products `status` vs `active`** — `active` = visible on browse. `status` = sale lifecycle (`available/sold/ended`). Can differ independently.
- **Relationship depth** — Product list queries need `depth=1`. Missing it = broken images/data.
- **Elasticsearch is optional** — Falls back to Payload's native query. Gated by `isElasticAvailable()`.
- **Media storage** — DigitalOcean Spaces (S3-compatible) via `cms/src/s3Adapter.ts`. Bucket: `veent`, prefix: `bidmoto`.
- **Migrations** — Pre-init (`cms/src/migrations/preInit.ts`) runs raw SQL before `payload.init()`. Post-init runs after. Staging uses `DB_PUSH=true`.
- **Legacy root docs** — `README.md`, `QUICKSTART.md`, `SETUP.md`, etc. are **outdated**. Use this file + slash commands.

## Deployment

- **Frontend** → Vercel at `www.bidmo.to` (auto-deploy from `main`)
- **Backend** → DigitalOcean droplet `188.166.216.176` with `docker-compose.prod.yml`, Caddy reverse proxy (auto-HTTPS)
- **Workflow:** `feature/x → staging → main` (staging branch deploys to `/opt/bidtomo-staging/`, main deploys to `/opt/bidtomo/`)
- **CI/CD:** GitHub Actions via SSH. Production runs `npm run migrate`; staging uses `DB_PUSH=true`.

See `/project:deploy` and `/project:staging` for URLs, env vars, infrastructure details.

## Slash Commands

- `/project:architecture` — Request flow, bidding pipeline, Redis channels, auth, key files
- `/project:frontend-guide` — Frontend architecture, stores, SSE, i18n, design system
- `/project:cms-guide` — Collections, routes, column naming, storage, migrations, services
- `/project:security` — Access control, rate limiting, CSRF, SSE auth, PII
- `/project:deploy` — URLs, infrastructure, CI/CD, Vercel/DO config, DNS
- `/project:staging` — Staging environment, URLs, differences from production
- `/project:push-staging` — Pre-push review and deploy to staging
- `/project:stagingtomain` — Staging to main merge and production deploy
- `/project:pitfalls` — Known bugs, gotchas, recurring issues
- `/project:env-vars` — All environment variables, CORS config
- `/project:tech-debt` — Known technical debt items
- `/project:stress-test` — k6 stress testing guide
- `/project:evaluate-repository` — Full repository evaluation
- `/frontend-god` — Deep frontend craft: motion, dark theme, Three.js, accessibility
