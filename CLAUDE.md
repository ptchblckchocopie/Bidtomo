# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidmo.to is a full-stack auction marketplace with real-time bidding. It consists of independently managed services (not a monorepo — no shared workspace tooling):

- **`frontend/`** — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel (both adapter-vercel and adapter-node are installed; currently using adapter-vercel for Vercel deployment)
- **`cms/`** — Payload CMS 2 on Express, PostgreSQL (via `@payloadcms/db-postgres`), Webpack bundler
- **`services/sse-service/`** — Standalone SSE server for real-time product updates
- **`services/bid-worker/`** — Background Redis queue consumer for bid processing

## Deployment

### Production Infrastructure
- **Frontend** — Deployed on **Vercel** (auto-deploys from `main` branch via GitHub integration)
- **CMS** — Deployed on **Railway** (project: `accomplished-perception`, service: `cms`). Deploy manually via `npx @railway/cli up` from `cms/` directory. NOT auto-deploy — requires `railway up` each time.
- **SSE Service** — Railway service `sse-service`
- **Bid Worker** — Railway service `bid-worker`
- **Database** — Railway PostgreSQL service
- **Redis** — Railway Redis service
- **Storage** — Supabase Storage (S3-compatible), bucket: `bidmo-media`, prefix: `bidmoto/`

### Deploying CMS to Railway
```bash
cd cms
npx @railway/cli up --detach    # Upload and deploy
npx @railway/cli deployment list --json --limit 1  # Check status
npx @railway/cli logs --lines 50  # View deploy logs
npx @railway/cli logs --build --lines 50  # View build logs
```

### Railway Project IDs
- Project: `d5441340-2ee1-4ecf-be7f-62325c9ea414` (accomplished-perception)
- CMS service: `3aee625c-eb29-4833-9e1f-7513cf5a718a`
- Bid worker service: `d6c2ca56-140b-4ad8-9284-ae96c8323293`
- SSE service: `f9a804a8-cfd6-4405-8e7e-6ac978458372`
- Environment: `production` (`a2ef8422-b3b9-4c28-9fb5-649aa4799877`)

### Vercel Project
- Team: `team_xP9PApyY2co0Lt9dlBg4XaPp` (ptchblckchocopie's projects)
- Project: `prj_xtn99uGJzihF1jyk5WKQloVoKg0E` (bidtomo)
- Auto-deploys from GitHub `main` branch

### Important: CMS Admin Webpack Build
Do NOT add `admin.css` to the Payload config. The `css` property in `admin: { css: ... }` triggers a Sass `@import '~payload-user-css'` during `payload build` that fails in the Nixpacks build environment. If you need to customize admin styles, use Payload's `components` API or webpack aliases instead.

### Important: Custom Admin React Components
TSX files in `cms/src/components/` are used only by Payload's webpack admin bundle (browser-side), NOT by the server-side `tsc` build. They are excluded from `tsconfig.json` via `"exclude": ["src/components/**/*.tsx"]`. To override a built-in Payload view, add a webpack alias in `payload.config.ts` (see `UnauthorizedView.tsx` as an example).

### Important: CMS `serverURL`
The `serverURL` in `payload.config.ts` is set to `process.env.SERVER_URL || ''` (empty string). Do NOT hardcode a domain — empty string makes Payload use relative URLs, which works from any domain (Railway, custom domain, localhost).

## Development Commands

### Frontend (`frontend/`)
```bash
npm run dev          # Vite dev server on :5173
npm run build        # Production build (outputs to build/)
npm run check        # svelte-kit sync + svelte-check (type checking)
npm run check:watch  # Type checking in watch mode
```

### CMS Backend (`cms/`)
```bash
npm run dev          # nodemon with PAYLOAD_CONFIG_PATH=src/payload.config.ts on :3001
npm run build        # tsc + payload build
npm run start        # Production server from dist/
npm run serve        # Same as start (used by Railway)
npm run migrate      # Run Payload database migrations
npm run migrate:up   # Apply pending migrations
npm run generate:types  # Regenerate payload-types.ts from collections
```

### Full Stack (from repo root)
```bash
./start-docker.sh    # Docker Compose: Postgres + Redis + all services
./stop-docker.sh     # Stop Docker Compose services
./setup-db.sh        # Initialize PostgreSQL database
./deploy.sh          # Blue/green production deployment with migrations
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

### Admin Features
- Only `admin` role users can access the Payload CMS admin panel (`access.admin` in users collection)
- Non-admin users who try to log into the CMS see a custom Unauthorized page (frog video + auto-redirect to login). This is implemented via a webpack alias in `payload.config.ts` that replaces Payload's built-in `Unauthorized` view with `cms/src/components/UnauthorizedView.tsx`
- Express middleware in `cms/src/server.ts` also redirects non-admin users to `/admin/access-denied` (server-side HTML page with frog video)
- Admin users see a **Hide/Unhide** button on product cards and detail pages in the frontend
- **Hidden Items** tab (admin-only) in the products browse page at `?status=hidden`
- Products use the existing `active` field (boolean) to control visibility

### Real-Time Bidding
Bids are queued via Redis (POST `/api/bid/queue`) and processed by the bid-worker service to prevent race conditions. Product pages receive live updates via SSE through the sse-service. Redis pub/sub powers notifications and typing indicators.

**Redis channels:**
- `sse:product:{id}` — bid updates, accepted events, typing indicators
- `sse:user:{id}` — message notifications
- `sse:global` — new product listings, cross-product bid updates

**SSE endpoints:**
- `/events/products/:productId` — product-specific updates
- `/events/users/:userId` — user message notifications
- `/events/global` — dashboard/browse page updates

**SSE client:** `frontend/src/lib/sse.ts` — handles SSE connections, reconnection logic, and event dispatching in the frontend.

### Payload CMS Structure
- Collections defined inline in `cms/src/payload.config.ts` (~1,000 lines): `users`, `products`, `bids`, `messages`, `transactions`, `void-requests`, `ratings`, `media`. `EmailTemplates` is in `cms/src/collections/EmailTemplates.ts`.
- `cms/src/server.ts` (~1,750 lines) — All custom Express endpoints (20+). Main business logic file.
- `cms/src/redis.ts` — Redis client, queue helpers (`queueBid`, `queueAcceptBid`), pub/sub publishers.
- `cms/src/auth-helpers.ts` — `authenticateJWT()` helper for custom endpoints.
- `cms/src/services/emailService.ts` — Resend-based transactional email service.
- Payload hooks (`beforeChange`, `afterChange`) are inline in collections and use `(global as any).publishProductUpdate` etc. for Redis pub/sub to avoid Webpack bundling issues.

### Storage
Image uploads go to **Supabase Storage** (S3-compatible) via `@payloadcms/plugin-cloud-storage`.
- Supabase URL: `https://htcdkqplcmdbyjlvzono.supabase.co`
- Bucket: `bidmo-media`
- Prefix: `bidmoto/`
- Public URL pattern: `https://htcdkqplcmdbyjlvzono.supabase.co/storage/v1/object/public/bidmo-media/bidmoto/{filename}`

### Frontend Rendering & Design
- SSR is disabled globally (`export const ssr = false` in `+layout.ts`) — the app is a client-side SPA.
- **Bauhaus design system**: sharp corners (`* { border-radius: 0 !important }` in `app.css`, only `.rounded-full` exempted), bold borders, Outfit font.
- Tailwind extended with `bh-*` tokens: colors (`bh-red`, `bh-blue`, `bh-yellow`, `bh-bg`, `bh-fg`), shadows (`shadow-bh-sm`, `shadow-bh-md`), borders (`border-bh`, `border-bh-lg`).
- Utility classes in `app.css`: `.btn-bh`, `.btn-bh-red`, `.btn-bh-blue`, `.card-bh`, `.input-bh`, `.headline-bh`.

### Error Tracking
Frontend uses `@sentry/sveltekit` for error tracking. SvelteKit config enables experimental `tracing` and `instrumentation` for server-side tracing.

## Key Configuration

- **Database:** PostgreSQL 14+. Migrations live in `cms/migrations/`. Schema push is disabled (`PUSH: false`).
- **CMS config:** `cms/src/payload.config.ts`
- **Frontend config:** `frontend/svelte.config.js` (adapter-vercel), `frontend/vite.config.ts`
- **Docker:** `docker-compose.yml` orchestrates Postgres (:5433), Redis (:6379), CMS (:3001), Frontend (:5173), SSE (:3002), bid-worker
- **Production (VPS):** PM2 via `ecosystem.config.js`
- **Production (Railway):** `cms/railway.toml`, `services/sse-service/railway.toml`, `services/bid-worker/railway.toml`
- **Redis default:** `redis://localhost:6379` — all services must use port 6379 (not 6380)

## Environment Variables

Backend (cms/.env): `DATABASE_URI`, `PAYLOAD_SECRET`, `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`, `SUPABASE_URL`, `RESEND_API_KEY`, `REDIS_URL`, `PORT` (default 3001), `SERVER_URL`, `FRONTEND_URL`

Frontend: `PUBLIC_API_URL` / `VITE_API_URL` / `CMS_URL` pointing to the CMS backend URL, `PUBLIC_SSE_URL` pointing to the SSE service

SSE Service: `REDIS_URL`, `PORT`/`SSE_PORT`, `SSE_CORS_ORIGIN`

Bid Worker: `REDIS_URL`, `DATABASE_URL`

## CORS Configuration

CORS is configured in two places:
1. `cms/src/payload.config.ts` — Payload's `cors` and `csrf` arrays
2. `cms/src/server.ts` — Express CORS middleware with dynamic origin checking

Allowed origins include: localhost variants, `bidmo.to`, `www.bidmo.to`, `app.bidmo.to`, `*.up.railway.app` (dynamic), `*.vercel.app`, private network IPs (`192.168.x.x`, `10.x.x.x`).

When adding a new deployment domain, add it to BOTH the Payload config and the Express CORS allowedOrigins list.

## Payload CMS Column Naming Convention

Payload CMS v2 postgres adapter uses `to-snake-case` for most column names, BUT **select/enum field columns keep the raw camelCase fieldName** as the column name. For example:
- `bidInterval` → column `bid_interval` (regular field, snake_case)
- `raterRole` (select field) → column `"raterRole"` (camelCase, quoted)
- Enum TYPE names are always snake_case: `enum_ratings_rater_role`

This was discovered by reading `@payloadcms/db-postgres/schema/traverseFields.js`. Keep this in mind when writing raw SQL or creating migration files.

---

## Known Pitfalls

These are recurring issues discovered during development. Check these when debugging:

- **`typeof x === 'object'` is true for `null`** — Always guard with `x && typeof x === 'object'` when checking Payload relationship fields (e.g., `originalDoc?.seller`).
- **Payload select/enum column naming** — See "Column Naming Convention" above. Raw SQL for select fields must use quoted camelCase (`"raterRole"`), not snake_case. This has caused migration failures.
- **SvelteKit `$env/static/public` fails if var is missing** — Use `$env/dynamic/public` for optional env vars (e.g., `PUBLIC_SSE_URL`).
- **SSE Redis reconnect duplicates** — Must call `punsubscribe` + `removeAllListeners('pmessage')` before re-subscribing on Redis reconnect, or handlers stack up.
- **CMS custom endpoints lack auth** — Custom Express routes in `cms/src/server.ts` don't get Payload's auth middleware automatically. Each endpoint copy-pastes a ~15-line JWT extraction block. When adding new endpoints, copy this pattern.
- **Redis port must be 6379** — All services (CMS, SSE, bid-worker) must use the same Redis instance. The CMS default was previously wrong (6380).
- **Bid-worker fallback paths** — When Redis is down, the CMS `/api/bid/accept` fallback in `cms/src/server.ts` must replicate everything the bid-worker does (message creation, transaction record, SSE publish).
- **`product.seller` can be null** — Always use optional chaining (`product.seller?.id`) in frontend templates. Seller is a relationship field that may not be populated.
- **No test suite exists** — Zero test files in the entire project. Validate changes manually or by reading code carefully.
- **Svelte 5 runes mode reactivity** — Any `.svelte` file using `$props()`, `$state()`, or `$derived()` is in runes mode. In runes mode, plain `let` variables are **NOT reactive**. All interactive state must use `$state()` to trigger UI updates. This has caused buttons/tabs to appear non-functional.
- **Adding relationship fields requires DB migration** — Adding an `upload` or `relationship` field to a Payload collection creates a `{collection}_rels` junction table. If the table doesn't exist, ALL queries on that collection fail with `relation "X_rels" does not exist`. The CMS startup migration in `server.ts` handles known cases (`users_rels`, `transactions_rels.void_requests_id`).
- **Expired JWT tokens cause 403 loops** — Frontend has `handleExpiredToken()` in `api.ts` that auto-logouts and redirects to `/login` on 401/403 responses.
- **Mobile edge-to-edge pattern** — The layout `<main>` has `px-4` padding. Page components must use `margin-left: -1rem; margin-right: -1rem; padding-left: 1rem; padding-right: 1rem;` in mobile media queries to go edge-to-edge and prevent Bauhaus box-shadows from causing visual right-shift.

### Profile Picture Feature
- Users can upload a profile picture on `/profile`. Images stored in Supabase via the `media` collection.
- `profilePicture` field on users collection (`type: 'upload', relationTo: 'media'`).
- CMS endpoints: `POST /api/users/profile-picture` (set new, delete old) and `DELETE /api/users/profile-picture` (remove).
- Bridge: `POST/DELETE /api/bridge/users/profile-picture`.
- Old profile pictures are automatically deleted from Supabase when replaced (storage efficiency).
- Profile pictures are shown on: profile page, product detail seller card, public user profile page (`/users/[id]`).
- The `PublicUserProfile` type and bridge endpoint `/api/bridge/users/[id]` include `profilePicture` in the response.

### Startup Database Migrations
The CMS `server.ts` runs auto-migrations on startup (after `payload.init`) using a direct `pg` Pool connection:
- Creates `users_rels` table (needed for `profilePicture` upload field)
- Adds `void_requests_id` column to `transactions_rels` (needed for `voidRequest` relationship)
- Uses `IF NOT EXISTS` / `EXCEPTION WHEN duplicate_*` so it's safe to run repeatedly.

## Technical Debt

- **JWT auth duplication** — Same 15-line JWT extraction block is copy-pasted 10+ times in `cms/src/server.ts`. Should be extracted to middleware.
- **Missing database indexes** — `bids(product_id, amount DESC)`, `products(status, active)`, `messages(product_id, read)`, `products(auction_end_date)`.
- **No input validation** — No schema validation (Zod/Joi) on POST bodies in custom CMS endpoints.
- **40+ `any` casts** in `cms/src/server.ts` and `(global as any)` pattern throughout.
- **N+1 queries** in `/api/create-conversations` and `fetchMyPurchases`.
- **No rate limiting** on any endpoint.

### Environment Variables — Do NOT Commit
Never push `.env` files to GitHub. Use platform dashboards instead:
- **Railway**: Project > Service > Variables tab (or `railway variables set KEY=VALUE`)
- **Vercel**: Project > Settings > Environment Variables (or `vercel env add KEY`)
- Only commit `.env.example` files with empty values as templates.
