# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidmo.to is a full-stack auction marketplace with real-time bidding. It consists of independently managed services (not a monorepo — no shared workspace tooling):

- **`frontend/`** — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel
- **`cms/`** — Payload CMS 2 on Express, PostgreSQL (via `@payloadcms/db-postgres`), Webpack bundler, Elasticsearch for search
- **`services/sse-service/`** — Standalone SSE server for real-time product updates
- **`services/bid-worker/`** — Background Redis queue consumer for bid processing

## Initial Setup

Each service has its own `package.json` — run `npm install` in each directory independently. Copy `.env.example` files before starting:

```bash
cp cms/.env.example cms/.env          # DATABASE_URI, PAYLOAD_SECRET, FRONTEND_URL, etc.
cp frontend/.env.example frontend/.env  # PUBLIC_API_URL
# services/sse-service/ and services/bid-worker/ have .env files already
```

## Development Commands

### Frontend (`frontend/`) — port 5173
```bash
npm run dev          # Vite dev server on :5173
npm run build        # Production build
npm run check        # svelte-kit sync + svelte-check (type checking)
npm run check:watch  # Type checking in watch mode
```

### CMS Backend (`cms/`) — port 3001
```bash
npm run dev          # nodemon with PAYLOAD_CONFIG_PATH=src/payload.config.ts on :3001
npm run build        # tsc + payload build
npm run serve        # Production server from dist/ (used by Railway)
npm run migrate      # Run Payload database migrations
npm run generate:types  # Regenerate payload-types.ts from collections
```

### Services (`services/`)

Each service has its own `package.json`. Build with `npm run build`, start with `npm start`.

- **bid-worker** — Redis BLPOP consumer. Writes to PostgreSQL directly (bypasses Payload ORM for performance).
- **sse-service** — Express SSE server on :3002. Subscribes to Redis pub/sub channels.

### Full Stack (from repo root)

```bash
# Local dev (infra only — Postgres :5433, Redis :6380, then run services natively)
docker compose -f docker-compose.local.yml up -d

# Full stack (all containers including app services)
./start-docker.sh    # Docker Compose: Postgres + Redis + all services
./stop-docker.sh     # Stop Docker Compose services
./setup-db.sh        # Initialize PostgreSQL database
./deploy.sh          # Blue/green production deployment with migrations
```

### Default Ports

| Service | Port |
|---------|------|
| Frontend (Vite) | 5173 |
| CMS (Payload) | 3001 |
| SSE service | 3002 |
| PostgreSQL | 5433 (mapped from 5432) |
| Redis | 6379 (full stack) / 6380 (local) |

### Stress Tests (`tests/stress/`)
```bash
npm run test:all     # Orchestrated k6 test suite (smoke → browse → auth → bids → full → search)
npm run test:bid-storm  # High-load bid simulation
npm run test:sse     # SSE connection stress test
npm run seed         # Generate test data
npm run seed:cleanup # Clean up test data
```

## Architecture Overview

**Request flow:** Browser → SvelteKit server route (`/api/bridge/*`) → Payload CMS (`localhost:3001/api/*`)

The frontend never calls the CMS directly from the browser. All requests go through SvelteKit server routes at `frontend/src/routes/api/bridge/` which proxy to the CMS backend. The proxy implementation is in `frontend/src/lib/server/cms.ts` (`cmsRequest()` function).

**Bridge route structure:** Most resources have dedicated bridge routes (`/api/bridge/users/`, `/api/bridge/products/`, `/api/bridge/bids/`, `/api/bridge/messages/`, `/api/bridge/transactions/`, `/api/bridge/ratings/`, `/api/bridge/typing/`, `/api/bridge/void-request/`, `/api/bridge/media/`, `/api/bridge/elasticsearch/`). The catch-all `[...path]/` handles anything not matched by a dedicated route.

**Real-time bidding pipeline:**
1. Client calls `queueBid()` → bridge → CMS `/api/bid/queue` → Redis list `bids:pending`
2. `bid-worker` pops from `bids:pending` via `BLPOP`, validates and writes to PostgreSQL directly (bypasses Payload ORM)
3. Worker publishes result to Redis pub/sub channel `sse:product:{productId}`
4. `sse-service` receives pub/sub message → pushes to connected SSE clients
5. Frontend `ProductSSEClient` in `sse.ts` receives event → updates UI (exponential backoff reconnection with fallback polling)
6. Fallback: if Redis is down, CMS creates bid directly (graceful degradation)

**Search:** Elasticsearch indexes products for full-text search with fuzzy matching. CMS search endpoint at `GET /api/search/products`. Bridge at `GET /api/bridge/products/search`. See `/project:cms-guide` for details.

**Key files:**
- `frontend/src/lib/api.ts` — Typed API client (1500+ lines, JWT auth)
- `frontend/src/lib/sse.ts` — SSE clients: ProductSSEClient, UserSSEClient, GlobalSSEClient (with polling fallback)
- `frontend/src/lib/server/cms.ts` — Bridge proxy helper (cmsRequest, getTokenFromRequest — reads httpOnly cookie + Authorization header)
- `frontend/src/lib/stores/auth.ts` — Auth store (user data in localStorage, JWT in httpOnly cookie)
- `frontend/src/hooks.server.ts` — CSRF Origin validation for bridge endpoints + Sentry
- `cms/src/payload.config.ts` — Collections: users, products, bids, messages, transactions, void-requests, ratings, media, email-templates
- `cms/src/server.ts` — All custom Express endpoints (21+ endpoints), main business logic (2200+ lines), rate limiting
- `cms/src/redis.ts` — Redis client, queue helpers, pub/sub publishers
- `cms/src/auth-helpers.ts` — `authenticateJWT()` for custom endpoints
- `cms/src/services/elasticSearch.ts` — Elasticsearch indexing and search (edge n-gram analyzer)
- `cms/src/services/emailService.ts` — Email queue via Redis + Resend API (rate-limited 2/sec), `escHtml()` for template safety

## Important Conventions

**SSR disabled** — The app is a client-side SPA (`export const ssr = false` in `+layout.ts`).

**Svelte 5 runes** — Frontend uses `$state`, `$derived`, `$props` (not Svelte 4 store syntax).

**Design system:** Bauhaus — sharp corners (`border-radius: 0`), bold borders, Outfit font. Tailwind theme (`frontend/tailwind.config.js`):
- Colors: `bh-bg`, `bh-fg`, `bh-red`, `bh-blue`, `bh-yellow`, `bh-border`, `bh-muted`, `primary` (#D02020)
- Shadows: `shadow-bh-sm` (3px), `shadow-bh-md` (5px) — solid black offsets
- Borders: `border-bh` (3px), `border-bh-lg` (5px)
- Utility classes: `.btn-bh`, `.card-bh`, `.input-bh`

**No linting/formatting** — Neither ESLint nor Prettier is configured. TypeScript strict mode is used in both frontend and CMS.

**CMS hooks auto-set fields** — Don't set these manually in API calls:
- Products: `seller` is set to the logged-in user in `beforeChange`
- Bids: `bidder` and `bidTime` are set automatically in `beforeChange`
- Ratings: `rater` is set to the logged-in user in `beforeChange`

**Media storage** — Uploaded files go to S3-compatible storage (Supabase Storage) via a custom adapter (`cms/src/s3Adapter.ts`). Public URLs are generated as `{SUPABASE_URL}/storage/v1/object/public/{S3_BUCKET}/bidmoto/{filename}`. Local storage is disabled in production.

**Collections are mostly inline** — All collections are defined directly in `cms/src/payload.config.ts` except `EmailTemplates` which has its own file at `cms/src/collections/EmailTemplates.ts`.

**Error tracking** — Frontend uses `@sentry/sveltekit` (configured in `hooks.client.ts`, `hooks.server.ts`, `instrumentation.server.ts`).

**TypeScript configs differ:**
- CMS: `target: ES2020`, `module: commonjs` (Node.js runtime)
- Frontend: `moduleResolution: bundler` (Vite/SvelteKit)

## Redis Keys & SSE Channels

| Key/Channel | Purpose |
|-------------|---------|
| `bids:pending` | Bid job queue (BLPOP by bid-worker) |
| `bids:failed` | Dead-letter queue for failed bids |
| `email:queue` | Email notification queue |
| `sse:product:{id}` | Pub/sub for product bid/status events |
| `sse:user:{id}` | Pub/sub for user message notifications |
| `sse:global` | Pub/sub for system-wide events (new products) |

## Deployment

- **Frontend:** Vercel (adapter-vercel), production at `bidmo.to`
- **CMS + SSE + Bid Worker:** Railway (nixpacks/dockerfile), blue/green via `deploy.sh`
- **PM2:** `ecosystem.config.js` manages all 4 services on the production server
- **Migrations:** Auto-applied during deploy; also `npm run migrate` in `cms/`

**Collections:** Most defined inline in `cms/src/payload.config.ts`: `users`, `products`, `bids`, `messages`, `transactions`, `void-requests`, `ratings`, `media`. `email-templates` is in `cms/src/collections/EmailTemplates.ts`. Media uses S3 via `@payloadcms/plugin-cloud-storage` (DigitalOcean Spaces).

**Auth:** JWT-based, dual transport. Login bridge sets an `httpOnly` cookie (`auth_token`, Secure, SameSite=Strict). Bridge helper `getTokenFromRequest()` reads from cookie first, then `Authorization: JWT <token>` header. Token also kept in `localStorage` as fallback for SSE connections. Custom CMS endpoints use `authenticateJWT()` from `cms/src/auth-helpers.ts`. User roles: `admin`, `seller`, `buyer`.

## Security Model

**Access control uses Payload `Where` queries** (not afterRead hooks) for messages, transactions, void-requests, and products. This filters at the DB level. Internal `payload.find/findByID` calls use `overrideAccess: true` (Payload local API default), so server-side logic is unaffected.

**Rate limiting:** CMS uses `express-rate-limit` — login (10/15min), registration (5/hr), bid queue/accept (30/min). Void requests are rate-limited at 5/user/24hr in application logic.

**CSRF:** `hooks.server.ts` validates Origin header on all state-changing bridge requests. Combined with `SameSite=Strict` cookie.

**SSE auth:** `/events/users/:userId` requires `?token=<jwt>` query param verified against `PAYLOAD_SECRET`. Product and global endpoints are unauthenticated (public data).

**Email templates:** All user-controlled values must be escaped with `escHtml()` (defined in `emailService.ts`). The `renderTemplate()` function auto-escapes `{{variable}}` substitutions.

**Users PII:** `afterRead` hook strips email, phone, countryCode from REST API responses. Only admins and the user themselves see full data. The hook checks `req.res` to skip for local API calls.

**Products visibility:** `read` access returns a `Where` query — non-admins only see `active: true` products (plus their own). Frontend load guards in `+page.ts` files provide defense-in-depth.

**Protected routes:** Use `+page.ts` load guards with `redirect()`, not client-side `onMount` checks. See `frontend/src/routes/sell/+page.ts`, `profile/+page.ts`, `inbox/+page.ts`.

## Testing & Quality

- **No unit/integration tests** — only k6 stress tests in `tests/stress/`
- **No ESLint/Prettier** — TypeScript compiler (`svelte-check` for frontend, `tsc` for CMS) is the primary code quality tool
- **Type generation:** Run `npm run generate:types` in `cms/` after changing collections to regenerate `payload-types.ts`

## CI/CD

- **CMS + services** → Railway via GitHub Actions (`.github/workflows/`). Push to `main` deploys to production; push to other branches deploys to `staging-v2`.
- **Frontend** → Vercel via Git integration (adapter-vercel). Not managed by GitHub Actions.

## Slash Commands for Detailed Guides

Use these project commands to load detailed context on-demand:

- `/project:deploy` — Deployment guide, Railway/Vercel IDs, CMS deploy commands
- `/project:pitfalls` — Known bugs, gotchas, and recurring issues
- `/project:cms-guide` — Payload CMS structure, collections, column naming, storage, migrations
- `/project:frontend-guide` — Frontend architecture, API bridge, auth, stores, SSE, design system
- `/project:env-vars` — All environment variables, CORS config, .env rules
- `/project:tech-debt` — Known technical debt items
- `/project:stress-test` — k6 stress testing guide, scenarios, report interpretation
- `/project:staging` — Staging environment setup, URLs, deploy commands
- `/project:push-staging` — Pre-push review and deploy to staging
- `/project:evaluate-repository` — Full repository evaluation (security, architecture, financial integrity, real-time reliability). Supports scoped mode: `security`, `code-quality`, `docs`, `functionality`, `testing`, `devops`, `hygiene`, `claude-code`, `financial`, `realtime`
