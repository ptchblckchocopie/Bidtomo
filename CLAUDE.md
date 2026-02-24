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
