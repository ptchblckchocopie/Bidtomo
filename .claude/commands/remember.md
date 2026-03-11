# Bidtomo — Full Project Briefing

Read this entire document before doing any work. This is the complete knowledge base for the Bidtomo auction marketplace.

---

## Stack

| Layer | Tech | Port |
|-------|------|------|
| Frontend | SvelteKit 2 + Svelte 5, Tailwind CSS 3, Vite, adapter-vercel | 5173 |
| CMS/API | Payload CMS 2, Express, PostgreSQL, Elasticsearch (optional) | 3001 |
| SSE | Express, Redis pub/sub, JWT auth | 3002 |
| Bid Worker | Node.js, Redis queue consumer, direct PostgreSQL writes | — |
| Database | PostgreSQL 15 | 5433 (local) |
| Cache/Queue | Redis | 6379/6380 |
| Storage | DigitalOcean Spaces (S3) — bucket `veent`, region `sgp1`, prefix `bidmoto` |
| Email | Resend |
| Errors | Sentry (all 4 services) |
| Hosting | Frontend: Vercel (`www.bidmo.to`), Backend: DigitalOcean droplet `188.166.216.176` |

---

## Directory Map

```
Bidtomo/
├── frontend/                    # SvelteKit SPA (SSR disabled)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +layout.ts          # SSR=false, root load
│   │   │   ├── +layout.svelte      # Nav, theme, auth init
│   │   │   ├── +page.svelte        # Home (Spline background)
│   │   │   ├── products/
│   │   │   │   ├── +page.svelte    # Browse grid with search/filters
│   │   │   │   └── [id]/+page.svelte  # Product detail + live bidding
│   │   │   ├── sell/+page.svelte   # Create/edit listing
│   │   │   ├── dashboard/+page.svelte # Seller dashboard
│   │   │   ├── inbox/+page.svelte  # Messages
│   │   │   ├── profile/+page.svelte # User profile + bid history
│   │   │   ├── watchlist/+page.svelte
│   │   │   ├── purchases/+page.svelte
│   │   │   ├── users/[id]/+page.svelte # Public profile + ratings
│   │   │   ├── admin/analytics/    # Admin analytics dashboard
│   │   │   ├── admin/reports/      # Admin moderation
│   │   │   ├── login/, register/, about-us/
│   │   │   └── api/bridge/         # ~40 server routes proxying to CMS
│   │   │       ├── users/          # login, logout, register, me, search, limits
│   │   │       ├── products/       # CRUD, search, status
│   │   │       ├── bid/            # queue, accept, auto
│   │   │       ├── messages/       # send, read
│   │   │       ├── transactions/   # list, detail
│   │   │       ├── ratings/        # create, list
│   │   │       ├── void-requests/  # 4-step dispute flow
│   │   │       ├── watchlist/      # add, remove
│   │   │       ├── analytics/      # track, dashboard
│   │   │       ├── reports/        # create, list
│   │   │       └── typing/         # typing status
│   │   ├── lib/
│   │   │   ├── api.ts              # Client API — all calls to /api/bridge/*
│   │   │   ├── sse.ts              # SSE handler (16KB), 3 channels, auto-reconnect
│   │   │   ├── analytics.ts        # Batched analytics (3s flush, sendBeacon)
│   │   │   ├── server/cms.ts       # Server-only cmsRequest() bridge
│   │   │   ├── stores/
│   │   │   │   ├── auth.ts         # Svelte 4 writable (user, token, isAuthenticated)
│   │   │   │   ├── inbox.ts        # Unread count
│   │   │   │   ├── theme.ts        # dark/light/system
│   │   │   │   ├── watchlist.ts    # Map<productId, itemId> for O(1)
│   │   │   │   ├── background.ts   # Background type selection
│   │   │   │   └── locale.ts       # Language
│   │   │   ├── components/         # 18 components
│   │   │   │   ├── ThreeBackground, SplineBackground, FloatingParticles
│   │   │   │   ├── ClickSpark, CustomCursor, GlowingEffect, ScrollReveal
│   │   │   │   ├── PageTransition, ThemeTransition, ThemeToggle
│   │   │   │   ├── MagneticButton, KebabMenu, ProductForm, KeywordInput
│   │   │   │   ├── ImageSlider, StarRating, WatchlistToggle, LanguageSwitcher
│   │   │   ├── data/categories.ts  # 19 categories + getCategoryLabel()
│   │   │   ├── i18n/               # Internationalization
│   │   │   └── actions/            # Custom Svelte actions
│   │   ├── hooks.server.ts         # CSRF protection on /api/bridge/* mutations
│   │   ├── hooks.client.ts         # Sentry init, auth subscribe
│   │   └── app.css                 # Tailwind + custom styles + Bauhaus design system
│   ├── svelte.config.js            # Vercel adapter, Sentry
│   └── .env.example                # CMS_URL, PUBLIC_SSE_URL, PUBLIC_SENTRY_ENVIRONMENT
│
├── cms/                            # Payload CMS 2 backend
│   ├── src/
│   │   ├── payload.config.ts       # 11 collections defined inline (except EmailTemplates)
│   │   ├── server.ts               # Express app, global fn injection, route registration (600+ lines)
│   │   ├── routes/                 # Custom endpoints (registered BEFORE payload.init())
│   │   │   ├── admin.ts            # Admin UI shadowing
│   │   │   ├── analytics.ts        # POST /api/analytics/track, GET /api/analytics/dashboard
│   │   │   ├── bids.ts             # /api/bid/queue, /api/bid/accept
│   │   │   ├── health.ts           # /api/health
│   │   │   ├── misc.ts             # conversations, elasticsearch sync, backup trigger
│   │   │   ├── products.ts         # Product-specific endpoints
│   │   │   ├── search.ts           # /api/search/products (ES with Payload fallback)
│   │   │   ├── typing.ts           # Typing status (POST set, GET poll)
│   │   │   ├── users.ts            # Auth, profile picture, limits
│   │   │   └── voidRequests.ts     # 4-step void/dispute flow
│   │   ├── collections/EmailTemplates.ts
│   │   ├── hooks/convertToWebP.ts  # Image processing
│   │   ├── middleware/
│   │   │   ├── requireAuth.ts      # JWT authentication
│   │   │   └── validate.ts         # Zod schemas
│   │   ├── services/
│   │   │   ├── emailService.ts     # Resend, queue via Redis, 2/sec rate limit
│   │   │   ├── elasticSearch.ts    # ES sync and search
│   │   │   ├── analyticsQueries.ts # Dashboard queries
│   │   │   └── backupService.ts    # pg_dump → DO Spaces (daily 3AM)
│   │   ├── migrations/
│   │   │   ├── preInit.ts          # Raw SQL before payload.init()
│   │   │   └── postInit.ts         # After init
│   │   ├── redis.ts                # Redis connection, queueBid(), publishProductUpdate(), etc.
│   │   ├── s3Adapter.ts            # DO Spaces S3 config
│   │   ├── auth-helpers.ts         # JWT helpers
│   │   ├── limiters.ts             # Rate limiters (disabled in dev)
│   │   └── instrument.ts           # Sentry
│   ├── Dockerfile
│   └── .env.example
│
├── services/
│   ├── sse-service/
│   │   └── src/index.ts            # 490 lines — 3 SSE endpoints, Redis psubscribe, IP limiting
│   └── bid-worker/
│       └── src/index.ts            # 1000+ lines — queue consumer, FOR UPDATE locks, auto-bid, crash recovery
│
├── docker-compose.prod.yml         # Caddy + prod-cms/sse/postgres/redis/bid-worker
├── docker-compose.staging.yml      # staging-* containers (no Caddy, uses shared network)
├── docker-compose.local.yml        # Postgres :5433, Redis :6380 only
├── docker-compose.yml              # LEGACY — do not use
├── Caddyfile                       # HTTPS routing: prod domain + staging domain + :80
├── .github/workflows/
│   ├── deploy-production.yml       # main → /opt/bidtomo (runs migrations)
│   └── deploy-staging.yml          # staging → /opt/bidtomo-staging (DB_PUSH=true)
├── ecosystem.config.js             # PM2 config for all 4 services
├── start.sh.local                  # Local dev: Docker + all services
└── CLAUDE.md                       # Project guide (source of truth)
```

---

## Core Data Flows

### 1. Bridge Proxy Pattern (ALL frontend→backend calls)

```
Browser → /api/bridge/<resource> (+server.ts) → cmsRequest() → CMS :3001/api/<resource>
```

- `cmsRequest()` in `frontend/src/lib/server/cms.ts` — server-only, uses `$env/dynamic/private`
- Token extraction order: `Authorization: JWT` → `Authorization: Bearer` → `auth_token` cookie
- Client-side `api.ts` only calls `/api/bridge/*` relative paths — never CMS directly

### 2. Auth: Dual Token Storage

```
Login → CMS returns JWT →
  1. httpOnly cookie `auth_token` (auto-sent to bridge routes)
  2. JSON body token → localStorage (used for SSE ?token= param)
Both must stay in sync.
```

JWT secret: Payload hashes `PAYLOAD_SECRET` with SHA-256 then slices to 32 chars. All services must replicate this.

### 3. Bidding Pipeline

```
Frontend POST /api/bridge/bid/queue
  → CMS validates → queueBid() → Redis RPUSH bids:pending
  → Bid Worker BLPOP → BEGIN → SELECT FOR UPDATE (lock product row)
  → Validate → INSERT bid → UPDATE products.current_bid → COMMIT
  → Publish to Redis sse:product:<id>
  → SSE service broadcasts to all connected clients
  → Frontend SSE listener updates UI reactively
```

- **Auto-bid:** Stored in `auto_bids` table. Worker detects outbid → increments by `bidInterval` until max.
- **Redis fallback:** CMS writes directly to PostgreSQL with same FOR UPDATE locking.
- **Crash recovery:** Unfinished bids restored from `pending_bids` table on worker restart.

### 4. SSE Real-Time

```
3 endpoints on :3002:
  /events/products/:id  — public, bid/accepted events
  /events/users/:id     — auth via ?token= JWT, messages/notifications
  /events/global        — public, new products + bid updates for browse grid

Redis channels: sse:product:<id>, sse:user:<id>, sse:global
Heartbeat: 15s | Per-IP limit: 20 connections | Auto-reconnect with backoff
```

### 5. Void/Dispute Flow (4 steps)

```
Buyer/Seller creates void-request → status: pending
  → Other party responds (accept/reject)
  → If product has second bidder: offered to them
  → Final resolution: product re-listed or voided
```

---

## Collections (11 total)

| Collection | Key Fields | Notes |
|-----------|-----------|-------|
| **users** | email, name, role (admin/seller/buyer), currency, profilePicture | Auth collection. Role forced to `buyer` on register. PII stripped in afterRead. |
| **products** | title, description, startingPrice, bidInterval, currentBid, seller, auctionEndDate, categories[], images[], active, status | `active`=visibility, `status`=lifecycle (available/sold/ended). Hooks auto-set seller. |
| **bids** | product, bidder, amount, bidTime, censorName | Hooks auto-set bidder/bidTime. Written by bid-worker, not Payload. |
| **messages** | product, sender, receiver, message, read | Hooks publish to user SSE channel. |
| **transactions** | product, seller, buyer, amount, status, notes | Status: pending/in_progress/completed/cancelled/voided. |
| **void-requests** | transaction, initiator, reason, status, sellerChoice, secondBidderResponse | 4-step dispute workflow. Email notifications at each step. |
| **media** | filename, url, mimetype | S3 to DO Spaces. URL: `https://veent.sgp1.digitaloceanspaces.com/bidmoto/{filename}` |
| **ratings** | transaction, rater, ratee, rating, comment, followUp | Auto-set rater. |
| **reports** | product, reporter, reason, status | Status: pending/reviewed/dismissed. |
| **user-events** | eventType, user, page, metadata, sessionId | Analytics. Admin-only. Fire-and-forget via `setImmediate`. |
| **EmailTemplates** | name, subject, html | Only collection in separate file. |

---

## Database Tables (Worker-Created)

Beyond Payload's auto-generated tables:

| Table | Purpose |
|-------|---------|
| `pending_bids` | Crash recovery — bids in-flight when worker died. UNIQUE on `job_id`. |
| `auto_bids` | Auto-bid settings. UNIQUE on `(product_id, bidder_id)`. |
| `products_rels` | Payload relationship table — `parent_id`, `path`, `users_id`/`media_id`. |

---

## Redis Keys

| Key | Type | Purpose |
|-----|------|---------|
| `bids:pending` | List | Bid job queue (FIFO) |
| `bids:failed` | List | Failed bids for inspection |
| `bids:processing` | String | Current job ID being processed |
| `sse:product:<id>` | Pub/sub | Product event channel |
| `sse:user:<id>` | Pub/sub | User notification channel |
| `sse:global` | Pub/sub | Global event channel |
| `email:queue` | List | Email job queue |

---

## Global Function Injection

Collection hooks can't import `ioredis` (crashes Webpack admin bundle), so `cms/src/server.ts` injects these at startup:

```
(global as any).publishProductUpdate(productId, payload)
(global as any).publishMessageNotification(userId, payload)
(global as any).publishGlobalEvent(payload)
(global as any).indexProduct(doc)
(global as any).updateProductIndex(productId, fields)
(global as any).trackEvent(eventType, userId, metadata)
```

---

## Rate Limiters (prod only, disabled in dev)

| Limiter | Limit |
|---------|-------|
| loginLimiter | 10/15min |
| registrationLimiter | 5/hour |
| bidLimiter | 30/min |
| analyticsLimiter | 120/min |
| reportLimiter | 5/hour |
| analyticsDashboardLimiter | 10/min |

---

## Environment Variables (Key)

**Frontend:** `CMS_URL` (server-to-server), `PUBLIC_SSE_URL` (browser-facing), `PUBLIC_SENTRY_ENVIRONMENT`

**CMS:** `DATABASE_URL`, `PAYLOAD_SECRET`, `SERVER_URL`, `REDIS_URL`, `FRONTEND_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET`, `RESEND_API_KEY`, `SENTRY_DSN`, `BACKUP_ENABLED`, `DB_PUSH`, `NODE_ENV`

**Services:** `REDIS_URL`, `DATABASE_URL`, `PAYLOAD_SECRET`, `SENTRY_DSN`, `NODE_ENV` + SSE: `PORT`, `SSE_CORS_ORIGIN`

---

## Deployment

| Target | Where | Trigger |
|--------|-------|---------|
| Frontend (prod) | Vercel `www.bidmo.to` | Push to `main` |
| Backend (prod) | DO droplet `/opt/bidtomo` | `deploy-production.yml` on `main` push |
| Backend (staging) | DO droplet `/opt/bidtomo-staging` | `deploy-staging.yml` on `staging` push |

**Docker containers (prod):** `prod-caddy`, `prod-cms`, `prod-sse`, `prod-postgres`, `prod-redis`, `prod-bid-worker`
**Docker containers (staging):** `staging-cms`, `staging-sse`, `staging-postgres`, `staging-redis`, `staging-bid-worker`

**Networks:** `bidtomo-shared` (external, links Caddy to both envs) + `prod-internal` / `staging-internal`

**CI gates:** `tsc --noEmit` (CMS) + `npm run check` (frontend). No unit tests.

**Workflow:** `feature/x → staging → main`

---

## Key Gotchas

1. **Caddy HTTP→HTTPS redirect strips auth headers** — Staging `CMS_URL` MUST use `https://`. Production uses bare IP `http://188.166.216.176` (Caddy `:80`, no redirect).
2. **`depth=1` required** on product list queries to populate relationships (media, seller). Missing it = broken images.
3. **`overrideAccess: true` doesn't skip field validation** — all `required` fields must still be provided.
4. **Custom routes registered BEFORE `payload.init()`** — otherwise Payload intercepts them.
5. **Products `status` vs `active`** — separate concepts. `active`=visibility, `status`=lifecycle.
6. **Auth store is Svelte 4 `writable`** — not yet migrated to Svelte 5 runes.
7. **Legacy docs at root** (README.md, QUICKSTART.md, etc.) are **outdated** — don't trust them.
8. **`docker-compose.yml`** (no suffix) is legacy — use `docker-compose.prod.yml` or `docker-compose.staging.yml`.

---

## Design System

**Bauhaus aesthetic:** Sharp corners, bold borders, Outfit font. Cinematic dark theme. No rounded corners.

---

## NPM Dependencies (Key)

**Frontend:** `@sveltejs/kit@^2.53`, `svelte@^5.53`, `tailwindcss@^3.4`, `three@^0.183`, `@splinetool/runtime@^1.12`, `gsap@^3.14`, `@sentry/sveltekit@^10.39`, `chart.js@^4.5`

**CMS:** `payload@^2.30`, `@payloadcms/db-postgres@^0.8`, `ioredis@^5.9`, `@elastic/elasticsearch@^9.3`, `resend@^6.6`, `@aws-sdk/client-s3@^3.914`, `zod@^4.3`, `sharp@^0.32`, `helmet@^8.1`, `@sentry/node@^9.47`

**SSE:** `express@^4.18`, `ioredis@^5.3`, `jsonwebtoken@^9.0`, `@sentry/node@^9.47`

**Bid Worker:** `ioredis@^5.3`, `pg@^8.11`, `@sentry/node@^9.47`
