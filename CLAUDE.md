# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidmo.to is a full-stack auction marketplace with real-time bidding. It consists of independently managed services (not a monorepo — no shared workspace tooling):

- **`frontend/`** — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel (adapter-node also installed)
- **`cms/`** — Payload CMS 2 on Express, PostgreSQL (via `@payloadcms/db-postgres`), Webpack bundler
- **`services/sse-service/`** — Standalone SSE server for real-time product updates (Express + ioredis)
- **`services/bid-worker/`** — Background Redis queue consumer for bid processing (ioredis + pg direct)

## Development Commands

### Frontend (`frontend/`)
```bash
npm run dev          # Vite dev server on :5173
npm run build        # Production build (outputs to build/)
npm run check        # svelte-kit sync + svelte-check (type checking)
```

### CMS Backend (`cms/`)
```bash
npm run dev          # nodemon with PAYLOAD_CONFIG_PATH=src/payload.config.ts on :3001
npm run build        # tsc + payload build
npm run start        # Production server from dist/
npm run migrate      # Run Payload database migrations
npm run migrate:up   # Apply pending migrations
npm run generate:types  # Regenerate payload-types.ts from collections
```

### Services (`services/sse-service/` and `services/bid-worker/`)
```bash
npm run dev          # ts-node src/index.ts
npm run build        # tsc
npm run start        # node dist/index.js
```

### Full Stack (from repo root)
```bash
./start.sh           # Start both frontend and backend locally
./start-docker.sh    # Docker Compose: Postgres + Redis + all services
./setup-db.sh        # Initialize PostgreSQL database
```

**No tests exist.** There are no test files, test configs, or test frameworks installed.

## Architecture

### API Bridge Pattern
The frontend never calls the CMS directly from the browser. All requests go through SvelteKit server routes at `frontend/src/routes/api/bridge/[...path]/` which proxy to the CMS backend. This keeps the CMS URL private and handles auth header forwarding.

**Request flow:** Browser → `frontend/src/lib/api.ts` → SvelteKit server route (`/api/bridge/*`) → Payload CMS (`localhost:3001/api/*`)

- **`frontend/src/lib/server/cms.ts`** — Server-side bridge helper: `cmsRequest()`, `getTokenFromRequest()`, `jsonResponse()`. All bridge `+server.ts` files use this.
- **`frontend/src/lib/api.ts`** — Client-side typed API functions (~1,500 lines, 40+ functions). Reads auth token from `localStorage.auth_token`, attaches `Authorization: JWT {token}` headers. Also exports all shared TypeScript types (`Product`, `User`, `Bid`, `Message`, `Transaction`, `Rating`, `VoidRequest`, etc.).

### Auth & Stores
- `frontend/src/lib/stores/auth.ts` — Svelte store managing JWT token + user data (persisted in localStorage)
- `frontend/src/lib/stores/inbox.ts` — Unread message count store
- Token format in headers: `Authorization: JWT {token}` (also accepts `Bearer`)
- User roles: `admin`, `seller`, `buyer` (default)

### Real-Time Bidding Flow
1. Browser POSTs bid → bridge → CMS `/api/bid/queue` → enqueues to Redis `bids:pending` list (direct DB fallback if Redis is down via `pending_bids` table)
2. **Bid-worker** polls `bids:pending` via BLPOP, validates, writes directly to PostgreSQL (bypasses CMS API), publishes Redis events
3. **SSE service** subscribes to Redis channels via `psubscribe`, fans out to connected browser clients
4. Redis channel scopes: `product:{id}` (bid updates), `user:{id}` (notifications), `global` (new products)
5. Both services use **separate Redis clients** for blocking ops vs pub/sub

### Payload CMS Structure
- **Collections are defined inline in `cms/src/payload.config.ts`** (~1,000 lines, not separate files), except `EmailTemplates` in `cms/src/collections/EmailTemplates.ts`
- Collections: `users`, `products`, `bids`, `messages`, `transactions`, `void-requests`, `ratings`, `media`, `email-templates`
- **`cms/src/server.ts`** (~1,750 lines) — All custom Express endpoints (20+). This is the main business logic file.
- **`cms/src/redis.ts`** — Redis client, queue helpers (`queueBid`, `queueAcceptBid`), pub/sub publishers
- **`cms/src/auth-helpers.ts`** — `authenticateJWT()` helper for custom endpoints
- **`cms/src/services/emailService.ts`** — Resend-based transactional email service
- Payload hooks (`beforeChange`, `afterChange`) are defined inline in collections and use global event publishers (e.g., `(global as any).publishProductUpdate`) to avoid Webpack bundling issues
- Webpack config in `payload.config.ts` sets Node.js module fallbacks to `false` (fs, crypto, os, etc.) and externalizes `jsonwebtoken`/`jwa`/`jws`

### Storage
Image uploads go to DigitalOcean Spaces (S3-compatible) via `@payloadcms/plugin-cloud-storage`. Adapter config in `cms/src/s3Adapter.ts`.

### SSE Client Architecture
`frontend/src/lib/sse.ts` provides two separate SSE clients:
- **`ProductSSEClient`** — Per-product events (bid updates, accepted bids). Connected on product detail pages.
- **`UserSSEClient`** — Per-user events (new messages, typing indicators). Connected globally for logged-in users.
- Dynamic URL: uses `PUBLIC_SSE_URL` env var; falls back to `/api/sse` on HTTPS or `localhost:3002` in dev.
- Event types: `BidEvent`, `MessageEvent`, `AcceptedEvent`, `TypingEvent`, `NewProductEvent`, `RedisStatusEvent`.

### Frontend Rendering
SSR is disabled globally: `export const ssr = false` in `frontend/src/routes/+layout.ts`. The entire app is a client-side SPA.

### Bauhaus Design System
The frontend uses a strict Bauhaus-inspired design with sharp corners and bold borders:
- **No border-radius anywhere** — `* { border-radius: 0 !important }` is set globally (only `.rounded-full` is exempted for circles)
- Tailwind extended with `bh-*` color tokens (`bh-red`, `bh-blue`, `bh-yellow`, `bh-bg`, `bh-fg`, `bh-border`, `bh-muted`)
- Custom shadows: `shadow-bh-sm` (3px offset), `shadow-bh-md` (5px offset)
- Custom border widths: `border-bh` (3px), `border-bh-lg` (5px)
- Utility classes in `app.css`: `.btn-bh`, `.btn-bh-red`, `.btn-bh-blue`, `.card-bh`, `.input-bh`, `.headline-bh`
- Font: Outfit (weights 400, 500, 700, 900)

### Admin Panel
Payload CMS's built-in admin UI at `/admin` is restricted:
- Non-admin users are redirected to a custom access-denied page (with a frog video)
- JWT cookie verification middleware guards `/admin` routes in `cms/src/server.ts`
- Admin UI is disabled entirely when `process.env.VERCEL === '1'` (frontend-only deployment)

### Monitoring
Sentry is integrated in the frontend (client + server hooks in `hooks.client.ts`, `hooks.server.ts`, `instrumentation.server.ts`).

## Key Configuration

- **Database:** PostgreSQL 14+. Migrations live in `cms/migrations/`. Schema push is disabled (`PUSH: false`).
- **CMS config:** `cms/src/payload.config.ts`
- **Frontend config:** `frontend/svelte.config.js` (adapter-vercel active), `frontend/vite.config.ts`
- **Docker:** `docker-compose.yml` orchestrates Postgres (:5433), Redis (:6379), CMS (:3001), Frontend (:5173), SSE (:3002), bid-worker
- **Production:** PM2 via `ecosystem.config.js`, Railway via `railway.toml`

## Environment Variables

Backend (`cms/.env`): `DATABASE_URI`, `PAYLOAD_SECRET`, `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`, `RESEND_API_KEY`, `PORT` (default 3001)

Frontend: `PUBLIC_API_URL` / `VITE_API_URL` (CMS backend URL), `PUBLIC_SSE_URL` (SSE service URL, uses `$env/dynamic/public`)

Services: `REDIS_URL`, `DATABASE_URL` (bid-worker), `SSE_CORS_ORIGIN` (sse-service, comma-separated origins)

Never commit `.env` files. Use Railway/Vercel dashboards for production variables.

## Frontend Routes

Key pages under `frontend/src/routes/`:
- `/products` — Browse/search products (homepage redirects here)
- `/products/[id]` — Product detail with real-time bid updates via SSE
- `/dashboard` — Seller dashboard (tabs: active/hidden/ended products, purchases)
- `/sell` — Create/edit products (`ProductForm.svelte`, ~1,200 lines)
- `/purchases` — Buyer purchase history
- `/inbox` — Messaging interface
- `/profile` — User profile settings
- `/login`, `/register` — Auth pages
- `/users/[id]` — Public user profile with ratings
- `api/bridge/[...path]` — CMS proxy (see API Bridge Pattern above)

Notable data file: `frontend/src/lib/data/philippineLocations.ts` — Regional/city location data used in product forms.

## Payload CMS Column Naming Convention

Payload CMS v2 postgres adapter uses `to-snake-case` for most column names, BUT **select/enum field columns keep the raw camelCase fieldName** as the column name. For example:
- `bidInterval` → column `bid_interval` (regular field, snake_case)
- `raterRole` (select field) → column `"raterRole"` (camelCase, quoted in SQL)
- Enum TYPE names are always snake_case: `enum_ratings_rater_role`

This matters when writing raw SQL or migration files. Source: `@payloadcms/db-postgres/schema/traverseFields.js`.

## Known Technical Debt

- **No tests** — Zero test files. Priority: bid-worker unit tests, CMS endpoint integration tests.
- **Duplicated JWT auth** — Same 15-line JWT extraction block is copy-pasted 10+ times in `cms/src/server.ts`. Should be extracted to middleware.
- **Missing DB indexes** — `bids(product_id, amount DESC)`, `products(status, active)`, `messages(product_id, read)`, `products(auction_end_date)`.
- **No rate limiting** — No rate limiting on any endpoint.
- **No input validation** — No schema validation on POST bodies.
- **Hardcoded secrets in git** — `ecosystem.config.js` and `docker-compose.yml` have credentials in git history.
- **40+ `any` casts** in `cms/src/server.ts`.
