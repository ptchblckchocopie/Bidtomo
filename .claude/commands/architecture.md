# Architecture Overview

## Request Flow

Browser → SvelteKit server route (`/api/bridge/*`) → Payload CMS (`localhost:3001/api/*`)

The frontend never calls the CMS directly from the browser. All requests go through SvelteKit server routes at `frontend/src/routes/api/bridge/` which proxy to the CMS backend. The proxy implementation is in `frontend/src/lib/server/cms.ts` (`cmsRequest()` function).

## Bridge Route Structure

Most resources have dedicated bridge routes (`/api/bridge/users/`, `/api/bridge/products/`, `/api/bridge/bids/`, `/api/bridge/messages/`, `/api/bridge/transactions/`, `/api/bridge/ratings/`, `/api/bridge/typing/`, `/api/bridge/void-request/`, `/api/bridge/media/`, `/api/bridge/elasticsearch/`). The catch-all `[...path]/` handles anything not matched by a dedicated route.

## Real-Time Bidding Pipeline

1. Client calls `queueBid()` → bridge → CMS `/api/bid/queue` → Redis list `bids:pending`
2. `bid-worker` pops from `bids:pending` via `BLPOP`, validates and writes to PostgreSQL directly (bypasses Payload ORM)
3. Worker publishes result to Redis pub/sub channel `sse:product:{productId}`
4. `sse-service` receives pub/sub message → pushes to connected SSE clients
5. Frontend `ProductSSEClient` in `sse.ts` receives event → updates UI (exponential backoff reconnection with fallback polling)
6. Fallback: if Redis is down, CMS creates bid directly (graceful degradation)

## Search

Elasticsearch indexes products for full-text search with fuzzy matching. CMS search endpoint at `GET /api/search/products`. Bridge at `GET /api/bridge/products/search`. See `/project:cms-guide` for details.

## Key Files

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

## Redis Keys & SSE Channels

| Key/Channel | Purpose |
|-------------|---------|
| `bids:pending` | Bid job queue (BLPOP by bid-worker) |
| `bids:failed` | Dead-letter queue for failed bids |
| `email:queue` | Email notification queue |
| `sse:product:{id}` | Pub/sub for product bid/status events |
| `sse:user:{id}` | Pub/sub for user message notifications |
| `sse:global` | Pub/sub for system-wide events (new products) |

## Auth

JWT-based, dual transport. Login bridge sets an `httpOnly` cookie (`auth_token`, Secure, SameSite=Strict). Bridge helper `getTokenFromRequest()` reads from cookie first, then `Authorization: JWT <token>` header. Token also kept in `localStorage` as fallback for SSE connections. Custom CMS endpoints use `authenticateJWT()` from `cms/src/auth-helpers.ts`. User roles: `admin`, `seller`, `buyer`.
