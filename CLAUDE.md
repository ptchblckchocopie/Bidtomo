# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidmo.to is a full-stack auction marketplace with real-time bidding. It consists of independently managed services (not a monorepo — no shared workspace tooling):

- **`frontend/`** — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel
- **`cms/`** — Payload CMS 2 on Express, PostgreSQL (via `@payloadcms/db-postgres`), Webpack bundler
- **`services/sse-service/`** — Standalone SSE server for real-time product updates
- **`services/bid-worker/`** — Background Redis queue consumer for bid processing

## Development Commands

Each service has its own `package.json` — run `npm install` in each directory independently.

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

### SSE Service (`services/sse-service/`) — port 3002
```bash
npm run dev          # ts-node dev server
npm run build        # tsc
npm start            # Node dist/index.js
```

### Bid Worker (`services/bid-worker/`) — no port (background process)
```bash
npm run dev          # ts-node dev
npm run build        # tsc
npm start            # Node dist/index.js
```

### Full Stack (from repo root)
```bash
./start-docker.sh    # Docker Compose: Postgres + Redis + all services
./stop-docker.sh     # Stop Docker Compose services
./setup-db.sh        # Initialize PostgreSQL database
./deploy.sh          # Blue/green production deployment with migrations
```

### Local Development (DB only via Docker)
```bash
docker compose -f docker-compose.local.yml up -d  # Postgres :5433, Redis :6380
# Then run each service locally with npm run dev
```

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

The frontend never calls the CMS directly from the browser. All requests go through SvelteKit server routes at `frontend/src/routes/api/bridge/[...path]/` which proxy to the CMS backend. The proxy implementation is in `frontend/src/lib/server/cms.ts` (`cmsRequest()` function).

**Real-time bidding pipeline:**
1. Client calls `queueBid()` → bridge → CMS `/api/bid/queue` → Redis list `bids:pending`
2. `bid-worker` pops from `bids:pending` via `BLPOP`, validates and inserts bid into PostgreSQL
3. Worker publishes result to Redis pub/sub channel `sse:product:{productId}`
4. `sse-service` receives pub/sub message → pushes to connected SSE clients
5. Frontend `ProductSSEClient` in `sse.ts` receives event → updates UI
6. Fallback: if Redis is down, CMS creates bid directly (graceful degradation)

**Key files:**
- `frontend/src/lib/api.ts` — Typed API client (1500+ lines, JWT auth from `localStorage.auth_token`)
- `frontend/src/lib/sse.ts` — SSE clients: ProductSSEClient, UserSSEClient, GlobalSSEClient (with polling fallback)
- `frontend/src/lib/server/cms.ts` — Bridge proxy helper (cmsRequest, getTokenFromRequest)
- `frontend/src/lib/stores/auth.ts` — Auth store (persists to localStorage, auto-logout on 401)
- `cms/src/payload.config.ts` — Collections: users, products, bids, messages, transactions, void-requests, ratings, media, email-templates
- `cms/src/server.ts` — All custom Express endpoints (21 endpoints), main business logic (2100+ lines)
- `cms/src/redis.ts` — Redis client, queue helpers, pub/sub publishers
- `cms/src/auth-helpers.ts` — `authenticateJWT()` for custom endpoints
- `cms/src/services/elasticSearch.ts` — Elasticsearch indexing and search (edge n-gram analyzer)
- `cms/src/services/emailService.ts` — Email queue via Redis + Resend API (rate-limited 2/sec)

## Important Conventions

**SSR disabled** — The app is a client-side SPA (`export const ssr = false` in `+layout.ts`).

**Svelte 5 runes** — Frontend uses `$state`, `$derived`, `$props` (not Svelte 4 store syntax).

**Design system:** Bauhaus — sharp corners (`border-radius: 0`), bold borders, Outfit font. Use `bh-*` Tailwind color tokens (`bh-bg`, `bh-fg`, `bh-red`, `bh-blue`, `bh-yellow`, `bh-border`, `bh-muted`) and `.btn-bh`, `.card-bh`, `.input-bh` utility classes.

**No linting/formatting** — Neither ESLint nor Prettier is configured. TypeScript strict mode is used in both frontend and CMS.

**CMS hooks auto-set fields** — Don't set these manually in API calls:
- Products: `seller` is set to the logged-in user in `beforeChange`
- Bids: `bidder` and `bidTime` are set automatically in `beforeChange`
- Ratings: `rater` is set to the logged-in user in `beforeChange`

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
