# CMS (Payload CMS) Guide

## Structure

- Collections defined inline in `cms/src/payload.config.ts` (~1,000 lines). `EmailTemplates` in `cms/src/collections/EmailTemplates.ts`.
- `cms/src/server.ts` (~2,200 lines) — All custom Express endpoints, main business logic, global function injection.
- `cms/src/redis.ts` — Redis client, queue helpers (`queueBid`, `queueAcceptBid`), pub/sub publishers.
- `cms/src/auth-helpers.ts` — `authenticateJWT()` for custom endpoints.
- `cms/src/services/emailService.ts` — Resend-based transactional email.
- `cms/src/services/backupService.ts` — PostgreSQL dump to DigitalOcean Spaces.
- `cms/src/services/elasticSearch.ts` — Elasticsearch indexing and search.

## Collections

| Collection | Notes |
|------------|-------|
| **users** | Auth, roles (admin/seller/buyer), profile, PII stripping in afterRead |
| **products** | Auction listings, media rels, `status` + `active` fields, multi-select `categories` |
| **bids** | Bid history, bidder/product relationships |
| **messages** | User-to-user messaging with conversation threads |
| **transactions** | Purchase/sale records, links to void-requests |
| **void-requests** | 4-step dispute/refund workflow |
| **media** | S3-backed file uploads (DigitalOcean Spaces) |
| **ratings** | User ratings and reviews |
| **reports** | Product moderation reports (pending/reviewed/dismissed) |
| **user-events** | Analytics tracking (admin-only, "Analytics" group) |
| **EmailTemplates** | Transactional email templates |

## Route Architecture (`cms/src/routes/`)

Custom endpoints in **modular route files**, each exporting `(app, payload, pool)` factory. All registered **before** `payload.init()` to avoid Payload's route interception. Most use `overrideAccess: true` (doesn't skip field validation).

| Module | Endpoints |
|--------|-----------|
| `admin.ts` | Admin route shadowing |
| `analytics.ts` | `POST /api/analytics/track`, `GET /api/analytics/dashboard` |
| `bids.ts` | `/api/bid/queue`, `/api/bid/accept` |
| `health.ts` | `/api/health` |
| `misc.ts` | `/api/create-conversations`, `/api/elasticsearch/sync`, `/api/sync-bids`, `/api/backup/trigger` |
| `products.ts` | Product-specific endpoints |
| `search.ts` | `/api/search/products` (Elasticsearch + Payload fallback) |
| `typing.ts` | `/api/typing`, `/api/typing/:productId` |
| `users.ts` | `/api/users/limits`, `/api/users/profile-picture`, auth |
| `voidRequests.ts` | `/api/void-request/*` (4-step void flow) |

## Redis Module (`cms/src/redis.ts`)

Exports: `isRedisConnected()`, `queueBid()`, `queueAcceptBid()`, `publishMessageNotification()`, `publishProductUpdate()`, `publishTypingStatus()`, `publishGlobalEvent()`, `closeRedis()`. `queueAcceptBid()` pushes `accept_bid` type jobs to `bids:pending`. Retries up to 3 times.

## Column Naming Convention

Payload CMS v2 postgres adapter: most columns are snake_case, BUT **select/enum field columns keep raw camelCase**:
- `bidInterval` → column `bid_interval` (regular field)
- `raterRole` (select) → column `"raterRole"` (camelCase, quoted)
- Enum TYPE names always snake_case: `enum_ratings_rater_role`

## Custom Admin React Components

TSX files in `cms/src/components/` — Payload's webpack admin bundle only (browser-side). Excluded from `tsconfig.json` via `"exclude": ["src/components/**/*.tsx"]`. Override views via webpack alias in `payload.config.ts`.

## Email Service (`cms/src/services/emailService.ts`)

Uses **Resend** npm package. Handles void request notifications, auction restarts, second bidder offers. Jobs queued via Redis `email:queue`. Rate-limited 2/sec internally. Falls back to direct send if Redis unavailable.

## Backup Service (`cms/src/services/backupService.ts`)

PostgreSQL dump → gzip → DigitalOcean Spaces. Scheduled via `node-cron` (daily 3 AM). Env vars: `BACKUP_ENABLED`, `BACKUP_CRON_SCHEDULE`, `BACKUP_RETENTION_DAYS` (default 7). Manual: `POST /api/backup/trigger` (admin-only).

## Storage

DigitalOcean Spaces (S3-compatible) via `cms/src/s3Adapter.ts`:
- Bucket: `veent`, region: `sgp1`, prefix: `bidmoto`
- Public URL: `https://veent.sgp1.digitaloceanspaces.com/bidmoto/{filename}`

## Elasticsearch

- **Index:** `products` — title, description, keywords, status, region, city
- **Search:** `GET /api/search/products?q=...&status=...&region=...&city=...&page=...&limit=...`
- **Sync:** `POST /api/elasticsearch/sync` (admin-only, bulk index)
- **Auto-indexing:** `afterChange` hooks via `(global as any).indexProduct()`
- **ES v9 compat:** Client overrides vendored headers with plain `application/json`
- **Fallback:** Payload `find()` with regex matching if ES unavailable
- **Env:** `ELASTICSEARCH_URL`

## Startup Migrations

`server.ts` runs auto-migrations after `payload.init()` using direct `pg` Pool:
- Creates `users_rels` table (for `profilePicture` upload field)
- Adds `void_requests_id` to `transactions_rels`
- Uses `IF NOT EXISTS` / `EXCEPTION WHEN duplicate_*` (safe to repeat)

## Analytics

`user-events` collection tracking frontend events (page views, searches) and CMS-side events (bids, messages, transactions) via `(global as any).trackEvent` + `setImmediate`. Full spec: `docs/analytics-spec.md`.
