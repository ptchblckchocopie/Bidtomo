# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidmo.to is a full-stack auction marketplace with real-time bidding. It consists of independently managed services (not a monorepo — no shared workspace tooling):

- **`frontend/`** — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel
- **`cms/`** — Payload CMS 2 on Express, PostgreSQL (via `@payloadcms/db-postgres`), Webpack bundler, Elasticsearch for search
- **`services/sse-service/`** — Standalone SSE server for real-time product updates
- **`services/bid-worker/`** — Background Redis queue consumer for bid processing

## Development Commands

### Frontend (`frontend/`)
```bash
npm run dev          # Vite dev server on :5173
npm run build        # Production build
npm run check        # svelte-kit sync + svelte-check (type checking)
npm run check:watch  # Type checking in watch mode
```

### CMS Backend (`cms/`)
```bash
npm run dev          # nodemon with PAYLOAD_CONFIG_PATH=src/payload.config.ts on :3001
npm run build        # tsc + payload build
npm run serve        # Production server from dist/ (used by Railway)
npm run migrate      # Run Payload database migrations
npm run generate:types  # Regenerate payload-types.ts from collections
```

### Full Stack (from repo root)
```bash
./start-docker.sh    # Docker Compose: Postgres + Redis + all services
./stop-docker.sh     # Stop Docker Compose services
./setup-db.sh        # Initialize PostgreSQL database
./deploy.sh          # Blue/green production deployment with migrations
```

## Architecture Overview

**Request flow:** Browser → SvelteKit server route (`/api/bridge/*`) → Payload CMS (`localhost:3001/api/*`)

The frontend never calls the CMS directly from the browser. All requests go through SvelteKit server routes at `frontend/src/routes/api/bridge/[...path]/` which proxy to the CMS backend.

**Real-time:** Bids queued via Redis → bid-worker processes → SSE service pushes live updates to clients via `frontend/src/lib/sse.ts`.

**Search:** Elasticsearch indexes products for full-text search with fuzzy matching. CMS search endpoint at `GET /api/search/products`. Bridge at `GET /api/bridge/products/search`. See `/project:cms-guide` for details.

**Key files:**
- `frontend/src/lib/api.ts` — Typed API client (JWT auth from `localStorage.auth_token`)
- `cms/src/payload.config.ts` — Collections: users, products, bids, messages, transactions, void-requests, ratings, media
- `cms/src/server.ts` — All custom Express endpoints (20+), main business logic
- `cms/src/redis.ts` — Redis client, queue helpers, pub/sub publishers
- `cms/src/auth-helpers.ts` — `authenticateJWT()` for custom endpoints
- `cms/src/services/elasticSearch.ts` — Elasticsearch client, indexing, search, bulk sync

**SSR disabled** — The app is a client-side SPA (`export const ssr = false` in `+layout.ts`).

**Design system:** Bauhaus — sharp corners (`border-radius: 0`), bold borders, Outfit font. Use `bh-*` Tailwind tokens and `.btn-bh`, `.card-bh`, `.input-bh` utility classes.

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
- `/project:evaluate-repository` — Full repository evaluation prompt (security, architecture, financial integrity, real-time reliability)
