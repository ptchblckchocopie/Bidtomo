# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidmo.to is a full-stack auction marketplace with real-time bidding. It consists of independently managed services (not a monorepo — no shared workspace tooling):

- **`frontend/`** — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-node
- **`cms/`** — Payload CMS 2 on Express, PostgreSQL (via `@payloadcms/db-postgres`), Webpack bundler
- **`services/sse-service/`** — Standalone SSE server for real-time product updates
- **`services/bid-worker/`** — Background Redis queue consumer for bid processing

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

### Full Stack (from repo root)
```bash
./start.sh           # Start both frontend and backend locally
./start-docker.sh    # Docker Compose: Postgres + Redis + all services
./setup-db.sh        # Initialize PostgreSQL database
```

## Architecture

### API Bridge Pattern
The frontend never calls the CMS directly from the browser. All requests go through SvelteKit server routes at `frontend/src/routes/api/bridge/[...path]/` which proxy to the CMS backend. This keeps the CMS URL private and handles auth header forwarding.

**Request flow:** Browser → SvelteKit server route (`/api/bridge/*`) → Payload CMS (`localhost:3001/api/*`)

### Frontend API Client
`frontend/src/lib/api.ts` contains typed functions for all API operations. It reads the auth token from `localStorage.auth_token` and attaches `Authorization: JWT {token}` headers.

### Auth & Stores
- `frontend/src/lib/stores/auth.ts` — Svelte store managing JWT token + user data (persisted in localStorage)
- `frontend/src/lib/stores/inbox.ts` — Unread message count store
- Token format in headers: `Authorization: JWT {token}` (also accepts `Bearer`)
- User roles: `admin`, `seller`, `buyer` (default)

### Real-Time Bidding
Bids are queued via Redis (POST `/api/bid/queue`) and processed by the bid-worker service to prevent race conditions. Product pages receive live updates via SSE through the sse-service. Redis pub/sub powers notifications and typing indicators.

### Payload CMS Collections
Defined in `cms/src/collections/`: `users`, `products`, `bids`, `messages`, `transactions`, `void-requests`, `ratings`, `media`, `EmailTemplates`. Custom Express endpoints are registered in `cms/src/server.ts`.

### Storage
Image uploads go to DigitalOcean Spaces (S3-compatible) via `@payloadcms/plugin-cloud-storage`.

## Key Configuration

- **Database:** PostgreSQL 14+. Migrations live in `cms/migrations/`. Schema push is disabled (`PUSH: false`).
- **CMS config:** `cms/src/payload.config.ts`
- **Frontend config:** `frontend/svelte.config.js` (adapter-node), `frontend/vite.config.ts`
- **Docker:** `docker-compose.yml` orchestrates Postgres (:5433), Redis (:6379), CMS (:3001), Frontend (:5173), SSE (:3002), bid-worker
- **Production:** PM2 via `ecosystem.config.js`, Railway via `railway.toml`

## Environment Variables

Backend (cms/.env): `DATABASE_URI`, `PAYLOAD_SECRET`, `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`, `RESEND_API_KEY`, `PORT` (default 3001)

Frontend: `PUBLIC_API_URL` / `VITE_API_URL` pointing to the CMS backend URL

## Payload CMS Column Naming Convention

Payload CMS v2 postgres adapter uses `to-snake-case` for most column names, BUT **select/enum field columns keep the raw camelCase fieldName** as the column name. For example:
- `bidInterval` → column `bid_interval` (regular field, snake_case)
- `raterRole` (select field) → column `"raterRole"` (camelCase, quoted)
- Enum TYPE names are always snake_case: `enum_ratings_rater_role`

This was discovered by reading `@payloadcms/db-postgres/schema/traverseFields.js`. Keep this in mind when writing raw SQL or creating migration files.

---

## Bugs Fixed (Session: 2026-02-24)

### Round 1 — Plan-Based Bug Fixes

1. **Accept-bid fallback missing message/transaction** (`cms/src/server.ts:671-718`)
   - When Redis is down, the fallback path for `/api/bid/accept` now creates the congratulatory message and transaction record, matching what the bid-worker does.

2. **SSE duplicate pmessage handlers on reconnect** (`services/sse-service/src/index.ts:282-288`)
   - Added `redis.removeAllListeners('pmessage')` before re-registering the handler.

3. **Bid-worker sellerId verification** (`services/bid-worker/src/index.ts:381-389`)
   - Added defense-in-depth check verifying `job.sellerId` matches the product's actual seller in the `products_rels` table.

4. **Accept_bid crash recovery** (`services/bid-worker/src/index.ts:662-714`)
   - Added `pending_bids` save and retry logic for `accept_bid` jobs, matching regular bid recovery.

5. **Void-request auth check** (`cms/src/server.ts:1471-1487`)
   - GET `/api/void-request/:transactionId` now verifies the user is buyer or seller before returning results.

6. **SSE_CORS_ORIGIN in PM2 config** (`ecosystem.config.js`)
   - Added `SSE_CORS_ORIGIN: 'https://www.bidmo.to'` to the SSE service PM2 config.

### Round 2 — Runtime Error Fixes

7. **Products table missing columns** — Added `region`, `city`, `delivery_options` columns and `enum_products_delivery_options` enum via ALTER TABLE.

8. **PUBLIC_SSE_URL import error** (`frontend/src/lib/sse.ts`)
   - Changed from `$env/static/public` to `$env/dynamic/public` to gracefully handle missing env var.

9. **Ratings table missing** — Created `ratings` and `ratings_rels` tables. Fixed column naming: select fields use camelCase (`"raterRole"`) not snake_case.

10. **Void-requests table column naming** — Renamed columns to match Payload's expected naming convention.

### Round 3 — Comprehensive Bug Audit Fixes

11. **CMS `/api/typing` missing JWT fallback** (`cms/src/server.ts:1512`)
    - Added JWT token extraction matching other authenticated endpoints.

12. **SSE service missing punsubscribe** (`services/sse-service/src/index.ts:282`)
    - Added `punsubscribe` before `psubscribe` on Redis reconnect to prevent duplicate subscriptions.

13. **Frontend SSE reconnect race condition** (`frontend/src/lib/sse.ts:298`)
    - `UserSSEClient.handleReconnect()` now clears existing timer before setting a new one.

14. **Auth store silent token corruption** (`frontend/src/lib/stores/auth.ts:34`)
    - Validates parsed user data has `id` and `email` before trusting it from localStorage.

15. **Unsafe null access `product.seller.id`** (`frontend/src/routes/products/+page.svelte:582`)
    - Changed to `product.seller?.id` with optional chaining.

16. **Unsafe null access `selectedProduct.seller.id`** (`frontend/src/routes/inbox/+page.svelte:978`)
    - Changed to `selectedProduct.seller?.id === $authStore.user?.id`.

17. **Bid-worker NaN validation gap** (`services/bid-worker/src/index.ts:248`)
    - Added explicit `isNaN(job.amount)` and `job.amount <= 0` check before bid processing.

18. **Bid-worker incomplete validation error matching** (`services/bid-worker/src/index.ts:739`)
    - Changed `'Product is sold'`/`'Product is ended'` to prefix `'Product is '` to catch all status variants.

19. **Payload config null pointer** (`cms/src/payload.config.ts:204`)
    - Fixed `typeof originalDoc?.seller === 'object'` (true for `null`) to `originalDoc?.seller && typeof originalDoc.seller === 'object'`.

---

## Recommended Improvements (Not Yet Implemented)

### Critical
- **Rotate exposed secrets** — `ecosystem.config.js` and `docker-compose.yml` have hardcoded S3 keys, DB passwords, PAYLOAD_SECRET in git history. Rotate all credentials.
- **Add rate limiting** — No rate limiting on any endpoint. Use `express-rate-limit`.
- **Add tests** — Zero test files exist. Priority: bid-worker unit tests, CMS endpoint integration tests.

### High
- **Extract JWT auth middleware** — Same 15-line JWT extraction block is copy-pasted 10+ times in `cms/src/server.ts`.
- **Add database indexes** — Missing composite indexes: `bids(product_id, amount DESC)`, `products(status, active)`, `messages(product_id, read)`, `products(auction_end_date)`.
- **Fix N+1 queries** — `/api/create-conversations` and `fetchMyPurchases` make per-item queries in loops.
- **Input validation** — No schema validation on POST bodies. Add Zod or Joi.
- **SSE connection limits** — No max connections per product/user in SSE service.

### Medium
- **Structured logging** — Replace 120+ `console.log` calls with Pino/Winston.
- **Fix type safety** — 40+ `any` casts in `cms/src/server.ts`. Remove `(global as any)` pattern.
- **Frontend performance** — Pagination renders all page buttons; `fetchUserBids` pulls 1000 records; countdown intervals update every second for all products.
- **Redis TTLs** — Queue keys have no expiration. In-memory `typingStatus` Map grows unbounded.
- **API documentation** — No OpenAPI/Swagger spec exists.
- **`.env.example` for services** — `bid-worker/` and `sse-service/` lack `.env.example` files.

### Environment Variables — Do NOT Commit
Never push `.env` files to GitHub. Use platform dashboards instead:
- **Railway**: Project > Service > Variables tab (or `railway variables set KEY=VALUE`)
- **Vercel**: Project > Settings > Environment Variables (or `vercel env add KEY`)
- Only commit `.env.example` files with empty values as templates.
