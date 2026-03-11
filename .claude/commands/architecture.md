# Architecture Overview

## Request Flow

Browser → SvelteKit server route (`/api/bridge/*`) → Payload CMS (`localhost:3001/api/*`)

The frontend never calls the CMS directly from the browser. All requests go through SvelteKit server routes at `frontend/src/routes/api/bridge/` which proxy to the CMS backend. The proxy implementation is in `frontend/src/lib/server/cms.ts` (`cmsRequest()` function).

## Bridge Route Structure

Most resources have dedicated bridge routes (`/api/bridge/users/`, `/api/bridge/products/`, `/api/bridge/bids/`, `/api/bridge/messages/`, `/api/bridge/transactions/`, `/api/bridge/ratings/`, `/api/bridge/typing/`, `/api/bridge/void-request/`, `/api/bridge/media/`, `/api/bridge/elasticsearch/`). The catch-all `[...path]/` handles anything not matched.

## Real-Time Bidding Pipeline

1. Client calls `queueBid()` → bridge → CMS `/api/bid/queue` → Redis list `bids:pending`
2. `bid-worker` pops from `bids:pending` via `BLPOP`, validates and writes to PostgreSQL directly (bypasses Payload ORM)
3. Worker publishes result to Redis pub/sub channel `sse:product:{productId}`
4. `sse-service` receives pub/sub message → pushes to connected SSE clients
5. Frontend `ProductSSEClient` in `sse.ts` receives event → updates UI (exponential backoff with fallback polling)
6. Fallback: if Redis is down, CMS creates bid directly (graceful degradation)

### Auto-Bid (Proxy Bidding)

Users set a maximum bid amount; the system automatically places minimum increment bids up to that max. When two auto-bidders compete, resolves immediately to the higher max (first-come-first-served on tie). Auto-bid jobs use the same `bids:pending` queue with type `auto_bid`. The bid-worker handles escalation logic.

### Race Condition Prevention

All bid writes use `SELECT ... FOR UPDATE` row-level locks on the products table — in the bid-worker, the Redis-down fallback path, and the second-bidder acceptance endpoint. Worker retries up to 3 times with 1s delay, failing to `bids:failed` queue.

## Search

Elasticsearch indexes products for full-text search with fuzzy matching. CMS endpoint: `GET /api/search/products`. Bridge: `GET /api/bridge/products/search`. Falls back to Payload `find()` if ES unavailable.

## Key Files

- `frontend/src/lib/api.ts` — Typed API client (~1500 lines, JWT auth)
- `frontend/src/lib/sse.ts` — SSE clients: Product, User, Global (with polling fallback)
- `frontend/src/lib/server/cms.ts` — Bridge proxy helper (cmsRequest, getTokenFromRequest)
- `frontend/src/lib/stores/auth.ts` — Auth store (localStorage + httpOnly cookie)
- `frontend/src/hooks.server.ts` — CSRF Origin validation + Sentry
- `cms/src/payload.config.ts` — All collections defined inline
- `cms/src/server.ts` — Custom Express endpoints (~2200 lines), global function injection
- `cms/src/redis.ts` — Redis client, queue helpers, pub/sub publishers
- `cms/src/auth-helpers.ts` — `authenticateJWT()` for custom endpoints
- `cms/src/services/elasticSearch.ts` — Elasticsearch indexing and search
- `cms/src/services/emailService.ts` — Email queue via Redis + Resend API

## Redis Keys & SSE Channels

| Key/Channel | Purpose |
|-------------|---------|
| `bids:pending` | Bid job queue (BLPOP by bid-worker) |
| `bids:processing` | Bid currently being processed |
| `bids:failed` | Dead-letter queue for failed bids |
| `email:queue` | Email notification queue |
| `sse:product:{id}` | Pub/sub for product bid/status events |
| `sse:user:{id}` | Pub/sub for user message notifications |
| `sse:global` | Pub/sub for system-wide events (new products) |

## Auth

JWT-based, dual transport. Login bridge sets an `httpOnly` cookie (`auth_token`, Secure, SameSite=Strict). Bridge helper `getTokenFromRequest()` reads from cookie first, then `Authorization: JWT <token>` header. Token also in `localStorage` for SSE connections. Custom CMS endpoints use `authenticateJWT()` from `cms/src/auth-helpers.ts`. User roles: `admin`, `seller`, `buyer`.

## CMS Global Function Injection

Collection hooks use `(global as any).*` because importing `ioredis` directly crashes Payload's Webpack admin bundle. Functions assigned in `cms/src/server.ts` at startup:
- `publishProductUpdate` — SSE product channel
- `publishMessageNotification` — SSE user channel
- `publishGlobalEvent` — SSE global channel
- `indexProduct` / `updateProductIndex` — Elasticsearch sync
- `trackEvent` — Analytics (fire-and-forget via `setImmediate`)
